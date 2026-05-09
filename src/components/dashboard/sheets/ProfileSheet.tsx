import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { usePlatform } from '@/platform';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import { useAuthStore } from '../../../store/auth';
import { authApi } from '../../../api/auth';
import { isValidEmail } from '../../../utils/validation';
import {
  notificationsApi,
  type NotificationSettings,
  type NotificationSettingsUpdate,
} from '../../../api/notifications';
import { referralApi } from '../../../api/referral';
import { brandingApi, type EmailAuthEnabled } from '../../../api/branding';
import { UI } from '../../../config/constants';
import { Switch } from '@/components/primitives/Switch';
import { Button } from '@/components/primitives/Button';
import { copyToClipboard } from '../../../utils/clipboard';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/primitives/Sheet/Sheet';

interface ProfileSheetProps {
  open: boolean;
  onClose: () => void;
  onLogout: () => void;
}

export default function ProfileSheet({ open, onClose, onLogout }: ProfileSheetProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const setUser = useAuthStore((state) => state.setUser);
  const queryClient = useQueryClient();
  const { platform } = usePlatform();

  const [copied, setCopied] = useState(false);
  const [changeEmailStep, setChangeEmailStep] = useState<'email' | 'code' | 'success' | null>(null);
  const [newEmail, setNewEmail] = useState('');
  const [changeCode, setChangeCode] = useState('');
  const [changeError, setChangeError] = useState<string | null>(null);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [verificationResendCooldown, setVerificationResendCooldown] = useState(0);
  const newEmailInputRef = useRef<HTMLInputElement>(null);
  const codeInputRef = useRef<HTMLInputElement>(null);

  const { data: referralInfo } = useQuery({
    queryKey: ['referral-info'],
    queryFn: referralApi.getReferralInfo,
    enabled: open,
  });

  const { data: referralTerms } = useQuery({
    queryKey: ['referral-terms'],
    queryFn: referralApi.getReferralTerms,
    enabled: open,
  });

  const { data: branding } = useQuery({
    queryKey: ['branding'],
    queryFn: brandingApi.getBranding,
    staleTime: 60000,
    enabled: open,
  });

  const { data: emailAuthConfig } = useQuery<EmailAuthEnabled>({
    queryKey: ['email-auth-enabled'],
    queryFn: brandingApi.getEmailAuthEnabled,
    staleTime: 60000,
    enabled: open,
  });
  const isEmailAuthEnabled = emailAuthConfig?.enabled ?? true;
  const isEmailVerificationEnabled = emailAuthConfig?.verification_enabled ?? true;

  const referralLink = referralInfo?.referral_code
    ? `${window.location.origin}/login?ref=${referralInfo.referral_code}`
    : '';

  const handleCopyReferral = async () => {
    if (!referralLink) return;
    await copyToClipboard(referralLink);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShareReferral = () => {
    if (!referralLink) return;
    const shareText = t('referral.shareMessage', {
      percent: referralInfo?.commission_percent || 0,
      botName: branding?.name || '',
    });
    if (navigator.share) {
      navigator
        .share({ title: t('referral.title'), text: shareText, url: referralLink })
        .catch(() => {});
      return;
    }
    window.open(
      `https://t.me/share/url?url=${encodeURIComponent(referralLink)}&text=${encodeURIComponent(shareText)}`,
      '_blank',
      'noopener,noreferrer',
    );
  };

  const resendVerificationMutation = useMutation({
    mutationFn: authApi.resendVerification,
    onSuccess: () => setVerificationResendCooldown(UI.RESEND_COOLDOWN_SEC),
  });

  const requestEmailChangeMutation = useMutation({
    mutationFn: (emailAddr: string) => authApi.requestEmailChange(emailAddr),
    onSuccess: async (data) => {
      setChangeError(null);
      if (data.expires_in_minutes === 0) {
        setChangeEmailStep('success');
        const updatedUser = await authApi.getMe();
        setUser(updatedUser);
      } else {
        setChangeEmailStep('code');
        setResendCooldown(UI.RESEND_COOLDOWN_SEC);
      }
    },
    onError: (err: { response?: { data?: { detail?: string } } }) => {
      setChangeError(err.response?.data?.detail || t('common.error'));
    },
  });

  const verifyEmailChangeMutation = useMutation({
    mutationFn: (code: string) => authApi.verifyEmailChange(code),
    onSuccess: async () => {
      setChangeError(null);
      setChangeEmailStep('success');
      const updatedUser = await authApi.getMe();
      setUser(updatedUser);
      queryClient.invalidateQueries({ queryKey: ['user'] });
    },
    onError: (err: { response?: { data?: { detail?: string } } }) => {
      setChangeError(err.response?.data?.detail || t('common.error'));
    },
  });

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setInterval(() => setResendCooldown((p) => Math.max(0, p - 1)), 1000);
    return () => clearInterval(id);
  }, [resendCooldown]);

  useEffect(() => {
    if (verificationResendCooldown <= 0) return;
    const id = setInterval(() => setVerificationResendCooldown((p) => Math.max(0, p - 1)), 1000);
    return () => clearInterval(id);
  }, [verificationResendCooldown]);

  useEffect(() => {
    if (platform === 'telegram') return;
    const id = setTimeout(() => {
      if (changeEmailStep === 'email') newEmailInputRef.current?.focus();
      else if (changeEmailStep === 'code') codeInputRef.current?.focus();
    }, 100);
    return () => clearTimeout(id);
  }, [changeEmailStep, platform]);

  useEffect(() => {
    if (changeEmailStep !== 'success') return;
    const id = setTimeout(() => resetChangeEmail(), 3000);
    return () => clearTimeout(id);
  }, [changeEmailStep]);

  const resetChangeEmail = () => {
    setChangeEmailStep(null);
    setNewEmail('');
    setChangeCode('');
    setChangeError(null);
    setResendCooldown(0);
  };

  const handleSendChangeCode = () => {
    setChangeError(null);
    if (!newEmail.trim() || !isValidEmail(newEmail.trim())) {
      setChangeError(t('profile.invalidEmail'));
      return;
    }
    if (user?.email && newEmail.toLowerCase().trim() === user.email.toLowerCase()) {
      setChangeError(t('profile.changeEmail.sameEmail'));
      return;
    }
    requestEmailChangeMutation.mutate(newEmail.trim());
  };

  const handleVerifyCode = () => {
    setChangeError(null);
    if (!changeCode.trim() || changeCode.trim().length < 4) {
      setChangeError(t('profile.changeEmail.invalidCode'));
      return;
    }
    verifyEmailChangeMutation.mutate(changeCode.trim());
  };

  const { data: notificationSettings, isLoading: notificationsLoading } = useQuery({
    queryKey: ['notification-settings'],
    queryFn: notificationsApi.getSettings,
    enabled: open,
  });

  const updateNotificationsMutation = useMutation({
    mutationFn: notificationsApi.updateSettings,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notification-settings'] }),
  });

  const toggleNotification = (key: keyof NotificationSettings, value: boolean) => {
    updateNotificationsMutation.mutate({ [key]: value } as NotificationSettingsUpdate);
  };

  const setNotificationValue = (key: keyof NotificationSettings, value: number) => {
    updateNotificationsMutation.mutate({ [key]: value } as NotificationSettingsUpdate);
  };

  const handleClose = () => {
    resetChangeEmail();
    onClose();
  };

  const row = (label: string, value: React.ReactNode) => (
    <div className="flex items-center justify-between border-b border-dark-800/50 py-3 last:border-0">
      <span className="text-dark-400">{label}</span>
      <span className="font-medium text-dark-100">{value}</span>
    </div>
  );

  return (
    <Sheet open={open} onOpenChange={(o) => !o && handleClose()}>
      <SheetContent className="max-h-[92vh]">
        <SheetHeader>
          <SheetTitle>{t('profile.title')}</SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-6">
          {/* Account info */}
          <section className="rounded-2xl border border-dark-700/50 bg-dark-800/60 p-4">
            <h3 className="mb-3 text-sm font-semibold text-dark-300">{t('profile.accountInfo')}</h3>
            <div>
              {row(t('profile.telegramId'), user?.telegram_id)}
              {user?.username && row(t('profile.username'), `@${user.username}`)}
              {row(t('profile.name'), `${user?.first_name ?? ''} ${user?.last_name ?? ''}`.trim())}
              {row(
                t('profile.registeredAt'),
                user?.created_at ? new Date(user.created_at).toLocaleDateString() : '-',
              )}
            </div>
          </section>

          {/* Connected accounts */}
          <button
            onClick={() => {
              handleClose();
              navigate('/profile/accounts');
            }}
            className="flex w-full items-center justify-between rounded-2xl border border-dark-700/50 bg-dark-800/60 p-4 text-left"
          >
            <div>
              <p className="font-medium text-dark-100">{t('profile.accounts.goToAccounts')}</p>
              <p className="text-sm text-dark-400">{t('profile.accounts.subtitle')}</p>
            </div>
            <svg
              className="h-5 w-5 text-dark-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          </button>

          {/* Referral link */}
          {referralTerms?.is_enabled && referralLink && (
            <section className="space-y-3 rounded-2xl border border-dark-700/50 bg-dark-800/60 p-4">
              <h3 className="text-sm font-semibold text-dark-300">{t('referral.yourLink')}</h3>
              <p className="break-all text-xs text-dark-400">{referralLink}</p>
              <div className="flex gap-2">
                <button
                  onClick={handleCopyReferral}
                  className="flex-1 rounded-xl bg-accent-500 py-2.5 text-sm font-semibold text-dark-950 active:opacity-80"
                >
                  {copied ? t('referral.copied') : t('referral.copyLink')}
                </button>
                <button
                  onClick={handleShareReferral}
                  className="flex-1 rounded-xl border border-dark-700/50 bg-dark-800/50 py-2.5 text-sm font-medium text-dark-200"
                >
                  {t('referral.shareButton')}
                </button>
              </div>
            </section>
          )}

          {/* Email */}
          {isEmailAuthEnabled && (
            <section className="space-y-3 rounded-2xl border border-dark-700/50 bg-dark-800/60 p-4">
              <h3 className="text-sm font-semibold text-dark-300">{t('profile.emailAuth')}</h3>

              {user?.email ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-dark-400">Email</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-dark-100">{user.email}</span>
                      {user.email_verified ? (
                        <span className="badge-success">{t('profile.verified')}</span>
                      ) : isEmailVerificationEnabled ? (
                        <span className="badge-warning">{t('profile.notVerified')}</span>
                      ) : null}
                    </div>
                  </div>

                  {!user.email_verified && isEmailVerificationEnabled && (
                    <div className="space-y-2 rounded-xl border border-warning-500/30 bg-warning-500/10 p-3">
                      <p className="text-sm text-warning-400">
                        {t('profile.verificationRequired')}
                      </p>
                      <Button
                        onClick={() => resendVerificationMutation.mutate()}
                        loading={resendVerificationMutation.isPending}
                        disabled={verificationResendCooldown > 0}
                      >
                        {verificationResendCooldown > 0
                          ? t('profile.resendIn', { seconds: verificationResendCooldown })
                          : t('profile.resendVerification')}
                      </Button>
                    </div>
                  )}

                  {!changeEmailStep && (
                    <button
                      onClick={() => setChangeEmailStep('email')}
                      className="text-sm text-accent-400"
                    >
                      {t('profile.changeEmail.button')}
                    </button>
                  )}

                  <AnimatePresence>
                    {changeEmailStep === 'email' && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="space-y-2 overflow-hidden"
                      >
                        <input
                          ref={newEmailInputRef}
                          type="email"
                          value={newEmail}
                          onChange={(e) => setNewEmail(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleSendChangeCode()}
                          placeholder="new@email.com"
                          className="input w-full"
                        />
                        {changeError && <p className="text-sm text-error-400">{changeError}</p>}
                        <div className="flex gap-2">
                          <Button
                            onClick={handleSendChangeCode}
                            loading={requestEmailChangeMutation.isPending}
                            disabled={!newEmail.trim()}
                          >
                            {t('profile.changeEmail.sendCode')}
                          </Button>
                          <button onClick={resetChangeEmail} className="text-sm text-dark-400">
                            {t('common.cancel')}
                          </button>
                        </div>
                      </motion.div>
                    )}
                    {changeEmailStep === 'code' && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="space-y-2 overflow-hidden"
                      >
                        <p className="text-sm text-accent-400">
                          {t('profile.changeEmail.codeSentTo', { email: newEmail })}
                        </p>
                        <input
                          ref={codeInputRef}
                          type="text"
                          inputMode="numeric"
                          value={changeCode}
                          onChange={(e) => setChangeCode(e.target.value.replace(/\D/g, ''))}
                          onKeyDown={(e) => e.key === 'Enter' && handleVerifyCode()}
                          placeholder="000000"
                          maxLength={6}
                          className="input w-full text-center text-2xl tracking-[0.5em]"
                        />
                        {changeError && <p className="text-sm text-error-400">{changeError}</p>}
                        <div className="flex items-center justify-between">
                          <div className="flex gap-2">
                            <Button
                              onClick={handleVerifyCode}
                              loading={verifyEmailChangeMutation.isPending}
                              disabled={!changeCode.trim()}
                            >
                              {t('profile.changeEmail.verify')}
                            </Button>
                            <button
                              onClick={() => {
                                setChangeEmailStep('email');
                                setChangeCode('');
                                setChangeError(null);
                              }}
                              className="text-sm text-dark-400"
                            >
                              {t('common.back')}
                            </button>
                          </div>
                          <button
                            onClick={() => requestEmailChangeMutation.mutate(newEmail.trim())}
                            disabled={resendCooldown > 0 || requestEmailChangeMutation.isPending}
                            className={`text-sm ${resendCooldown > 0 ? 'text-dark-500' : 'text-accent-400'}`}
                          >
                            {resendCooldown > 0
                              ? t('profile.changeEmail.resendIn', { seconds: resendCooldown })
                              : t('profile.changeEmail.resendCode')}
                          </button>
                        </div>
                      </motion.div>
                    )}
                    {changeEmailStep === 'success' && (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="rounded-xl border border-success-500/30 bg-success-500/10 p-3"
                      >
                        <p className="text-sm text-success-400">
                          {t('profile.changeEmail.success')}
                        </p>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-dark-400">{t('profile.linkEmailDescription')}</p>
                  <Button
                    onClick={() => {
                      handleClose();
                      navigate('/profile/accounts');
                    }}
                  >
                    {t('profile.linkEmail')}
                  </Button>
                </div>
              )}
            </section>
          )}

          {/* Notifications */}
          <section className="space-y-4 rounded-2xl border border-dark-700/50 bg-dark-800/60 p-4">
            <h3 className="text-sm font-semibold text-dark-300">
              {t('profile.notifications.title')}
            </h3>

            {notificationsLoading ? (
              <div className="flex justify-center py-2">
                <div className="h-5 w-5 animate-spin rounded-full border-2 border-accent-500 border-t-transparent" />
              </div>
            ) : notificationSettings ? (
              <div className="space-y-4">
                {/* Subscription expiry */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-dark-100">
                        {t('profile.notifications.subscriptionExpiry')}
                      </p>
                      <p className="text-xs text-dark-400">
                        {t('profile.notifications.subscriptionExpiryDesc')}
                      </p>
                    </div>
                    <Switch
                      checked={notificationSettings.subscription_expiry_enabled}
                      onCheckedChange={(v) => toggleNotification('subscription_expiry_enabled', v)}
                    />
                  </div>
                  {notificationSettings.subscription_expiry_enabled && (
                    <div className="flex items-center gap-2 pl-2">
                      <span className="text-xs text-dark-400">
                        {t('profile.notifications.daysBeforeExpiry')}
                      </span>
                      <select
                        value={notificationSettings.subscription_expiry_days}
                        onChange={(e) =>
                          setNotificationValue('subscription_expiry_days', Number(e.target.value))
                        }
                        className="input w-16 py-1 text-sm"
                      >
                        {[1, 2, 3, 5, 7, 14].map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {/* Traffic warning */}
                <div className="space-y-2 border-t border-dark-800/50 pt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-dark-100">
                        {t('profile.notifications.trafficWarning')}
                      </p>
                      <p className="text-xs text-dark-400">
                        {t('profile.notifications.trafficWarningDesc')}
                      </p>
                    </div>
                    <Switch
                      checked={notificationSettings.traffic_warning_enabled}
                      onCheckedChange={(v) => toggleNotification('traffic_warning_enabled', v)}
                    />
                  </div>
                  {notificationSettings.traffic_warning_enabled && (
                    <div className="flex items-center gap-2 pl-2">
                      <span className="text-xs text-dark-400">
                        {t('profile.notifications.atPercent')}
                      </span>
                      <select
                        value={notificationSettings.traffic_warning_percent}
                        onChange={(e) =>
                          setNotificationValue('traffic_warning_percent', Number(e.target.value))
                        }
                        className="input w-20 py-1 text-sm"
                      >
                        {[50, 70, 80, 90, 95].map((p) => (
                          <option key={p} value={p}>
                            {p}%
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {/* Balance low */}
                <div className="space-y-2 border-t border-dark-800/50 pt-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-dark-100">
                        {t('profile.notifications.balanceLow')}
                      </p>
                      <p className="text-xs text-dark-400">
                        {t('profile.notifications.balanceLowDesc')}
                      </p>
                    </div>
                    <Switch
                      checked={notificationSettings.balance_low_enabled}
                      onCheckedChange={(v) => toggleNotification('balance_low_enabled', v)}
                    />
                  </div>
                  {notificationSettings.balance_low_enabled && (
                    <div className="flex items-center gap-2 pl-2">
                      <span className="text-xs text-dark-400">
                        {t('profile.notifications.threshold')}
                      </span>
                      <input
                        type="number"
                        value={notificationSettings.balance_low_threshold}
                        onChange={(e) =>
                          setNotificationValue('balance_low_threshold', Number(e.target.value))
                        }
                        min={0}
                        className="input w-24 py-1 text-sm"
                      />
                    </div>
                  )}
                </div>

                {/* News */}
                <div className="flex items-center justify-between border-t border-dark-800/50 pt-4">
                  <div>
                    <p className="text-sm font-medium text-dark-100">
                      {t('profile.notifications.news')}
                    </p>
                    <p className="text-xs text-dark-400">{t('profile.notifications.newsDesc')}</p>
                  </div>
                  <Switch
                    checked={notificationSettings.news_enabled}
                    onCheckedChange={(v) => toggleNotification('news_enabled', v)}
                  />
                </div>

                {/* Promo offers */}
                <div className="flex items-center justify-between border-t border-dark-800/50 pt-4">
                  <div>
                    <p className="text-sm font-medium text-dark-100">
                      {t('profile.notifications.promoOffers')}
                    </p>
                    <p className="text-xs text-dark-400">
                      {t('profile.notifications.promoOffersDesc')}
                    </p>
                  </div>
                  <Switch
                    checked={notificationSettings.promo_offers_enabled}
                    onCheckedChange={(v) => toggleNotification('promo_offers_enabled', v)}
                  />
                </div>
              </div>
            ) : (
              <p className="text-sm text-dark-400">{t('profile.notifications.unavailable')}</p>
            )}
          </section>

          {/* Logout */}
          <button
            onClick={onLogout}
            className="flex w-full items-center justify-center rounded-2xl border border-red-500/20 bg-red-500/10 py-3.5 text-sm font-medium text-red-400 active:bg-red-500/20"
          >
            {t('nav.logout')}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

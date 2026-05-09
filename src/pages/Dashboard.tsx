import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';

import { useAuthStore } from '../store/auth';
import { subscriptionApi } from '../api/subscription';
import { referralApi } from '../api/referral';
import { balanceApi } from '../api/balance';
import { infoApi } from '../api/info';
import { usePlatform } from '@/platform';
import { copyToClipboard } from '../utils/clipboard';
import { useCurrency } from '../hooks/useCurrency';
import { useHaptic } from '@/platform';
import { formatTraffic } from '../utils/formatTraffic';
import { cn } from '@/lib/utils';
import { API } from '../config/constants';
import type { TrialInfo } from '../types';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/primitives/Sheet/Sheet';
import { useTelegramSDK } from '@/hooks/useTelegramSDK';
import type { Transaction, AppConfig, PaymentMethod } from '../types';
import { checkRateLimit, getRateLimitResetTime, RATE_LIMIT_KEYS } from '../utils/rateLimit';
import { saveTopUpPendingInfo } from '../utils/topUpStorage';
import RenewSheet from '@/components/dashboard/sheets/RenewSheet';
import PurchaseSheet from '@/components/dashboard/sheets/PurchaseSheet';
import ProfileSheet from '@/components/dashboard/sheets/ProfileSheet';
import InstallationGuide from '@/components/connection/InstallationGuide';
import { openLink as sdkOpenLink } from '@telegram-apps/sdk-react';
import { resolveTemplate, hasTemplates } from '../utils/templateEngine';
import { isHappCryptolinkMode, resolveConnectionUrlForUi } from '../utils/connectionLink';

// ─── Icons ───────────────────────────────────────────────────────────────────

const UserCircleIcon = () => (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z"
    />
  </svg>
);

const GearIcon = () => (
  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z"
    />
    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
  </svg>
);

const LinkIcon = () => (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m13.35-.622l1.757-1.757a4.5 4.5 0 00-6.364-6.364l-4.5 4.5a4.5 4.5 0 001.242 7.244"
    />
  </svg>
);

const WalletIcon = () => (
  <svg
    className="h-3.5 w-3.5"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={1.5}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 11-6 0H5.25A2.25 2.25 0 003 12m18 0v6a2.25 2.25 0 01-2.25 2.25H5.25A2.25 2.25 0 013 18v-6m18 0V9M3 12V9m18 0a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 9m18 0V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v3"
    />
  </svg>
);

const GridIcon = () => (
  <svg
    className="h-3.5 w-3.5"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={1.5}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z"
    />
  </svg>
);

const UsersIcon = () => (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"
    />
  </svg>
);

const ClockIcon = () => (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
    />
  </svg>
);

const ChatIcon = () => (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z"
    />
  </svg>
);

const InfoCircleIcon = () => (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"
    />
  </svg>
);

const TagIcon = () => (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M9.568 3H5.25A2.25 2.25 0 003 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 005.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 009.568 3z"
    />
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6z" />
  </svg>
);

const ShieldIcon = () => (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z"
    />
  </svg>
);

const BellIcon = () => (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0"
    />
  </svg>
);

const ChevronRightIcon = () => (
  <svg
    className="h-3 w-[7px]"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={2}
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
  </svg>
);

const CopyIcon = () => (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184"
    />
  </svg>
);

const CheckIcon = () => (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
  </svg>
);

const ArrowUpIcon = () => (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
  </svg>
);

const ArrowDownIcon = () => (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 13.5L12 21m0 0l-7.5-7.5M12 21V3" />
  </svg>
);

const ShareIcon = () => (
  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M7 8l5-5m0 0l5 5m-5-5v12" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M4 15v3a2 2 0 002 2h12a2 2 0 002-2v-3" />
  </svg>
);

// ─── Helper ───────────────────────────────────────────────────────────────────

function daysUntil(dateStr: string): number {
  const diff = new Date(dateStr).getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / 86_400_000));
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

// ─── Balance Sheet ────────────────────────────────────────────────────────────

type BalanceStep = 'overview' | 'topup' | 'amount';

function BalanceSheet({
  open,
  onClose,
  balanceRubles,
  transactions,
  initialAmount,
}: {
  open: boolean;
  onClose: () => void;
  balanceRubles: number;
  transactions: Transaction[];
  initialAmount?: number;
}) {
  const { formatAmount, currencySymbol, convertAmount, convertToRub, targetCurrency } =
    useCurrency();
  const { openInvoice, openTelegramLink, openLink } = usePlatform();
  const queryClient = useQueryClient();
  const { t } = useTranslation();

  const [step, setStep] = useState<BalanceStep>(() => (initialAmount ? 'topup' : 'overview'));
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(null);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [payError, setPayError] = useState<string | null>(null);
  const [paymentUrl, setPaymentUrl] = useState<string | null>(null);

  // When opened with a preset amount — jump straight to method selection
  useEffect(() => {
    if (open) {
      setStep(initialAmount ? 'topup' : 'overview');
    }
  }, [open, initialAmount]);

  // Promo code
  const [promoCode, setPromoCode] = useState('');
  const [promoResult, setPromoResult] = useState<{ success: boolean; message: string } | null>(
    null,
  );
  const promoMutation = useMutation({
    mutationFn: () => balanceApi.activatePromocode(promoCode.trim()),
    onSuccess: (data) => {
      setPromoResult({
        success: data.success,
        message: data.success
          ? 'Промокод успешно применён!'
          : 'Промокод недействителен или уже использован',
      });
      if (data.success) {
        setPromoCode('');
        queryClient.invalidateQueries({ queryKey: ['balance'] });
      }
    },
    onError: () => setPromoResult({ success: false, message: 'Не удалось применить промокод' }),
  });

  // Payment methods
  const { data: paymentMethods, isLoading: methodsLoading } = useQuery({
    queryKey: ['payment-methods'],
    queryFn: balanceApi.getPaymentMethods,
    enabled: open,
    staleTime: 60_000,
  });

  // Auto-select when only one available method
  useEffect(() => {
    if (step !== 'topup' || methodsLoading || !paymentMethods) return;
    const available = paymentMethods.filter((m) => m.is_available);
    if (available.length === 1) {
      handleSelectMethod(available[0]);
    }
  }, [step, methodsLoading, paymentMethods]);

  // Payment mutations
  const isStars = selectedMethod?.id.toLowerCase().includes('stars') ?? false;
  const starsPayMutation = useMutation({
    mutationFn: (kopeks: number) => balanceApi.createStarsInvoice(kopeks),
    onSuccess: async (data) => {
      if (!data.invoice_url) {
        setPayError('Нет ссылки для оплаты');
        return;
      }
      try {
        const status = await openInvoice(data.invoice_url);
        if (status === 'paid') {
          setStep('overview');
          onClose();
        } else if (status === 'failed') setPayError('Оплата не прошла');
      } catch {
        setPayError('Ошибка при открытии платежа');
      }
    },
    onError: (e: { response?: { data?: { detail?: string } } }) =>
      setPayError(e.response?.data?.detail || 'Ошибка'),
  });

  const topUpMutation = useMutation({
    mutationFn: (kopeks: number) => {
      if (!selectedMethod) throw new Error('no method');
      return balanceApi.createTopUp(kopeks, selectedMethod.id, selectedOption || undefined);
    },
    onSuccess: (data) => {
      const url = data.payment_url;
      if (url) {
        if (selectedMethod) {
          const mk = selectedMethod.id.toLowerCase().replace(/-/g, '_');
          const displayName =
            t(`balance.paymentMethods.${mk}.name`, { defaultValue: '' }) || selectedMethod.name;
          if (data.payment_id)
            saveTopUpPendingInfo({
              amount_kopeks: data.amount_kopeks,
              method_id: selectedMethod.id,
              method_name: displayName,
              payment_id: data.payment_id,
              created_at: Date.now(),
            });
        }
        setPaymentUrl(url);
        if (url.includes('t.me/')) openTelegramLink(url);
        else openLink(url);
      }
    },
    onError: (e: { response?: { data?: { detail?: string } } }) =>
      setPayError(e.response?.data?.detail || 'Ошибка'),
  });

  const handleClose = () => {
    setStep('overview');
    setSelectedMethod(null);
    setAmount('');
    setPayError(null);
    setPaymentUrl(null);
    setPromoResult(null);
    onClose();
  };

  const isSbp = (o: { id: string; name: string }) =>
    o.id.toLowerCase().includes('sbp') ||
    o.name.toLowerCase().includes('сбп') ||
    o.name.toLowerCase().includes('sbp');

  const handleSelectMethod = (m: PaymentMethod) => {
    setSelectedMethod(m);
    const opts = (m.options ?? []).filter((o) => !isSbp(o));
    setSelectedOption(opts[0]?.id ?? null);
    setAmount(initialAmount ? String(initialAmount) : '');
    setPayError(null);
    setPaymentUrl(null);
    setStep('amount');
  };

  const handlePay = () => {
    if (!selectedMethod) return;
    setPayError(null);
    setPaymentUrl(null);
    if (!checkRateLimit(RATE_LIMIT_KEYS.PAYMENT, 3, 30000)) {
      setPayError(`Подождите ${getRateLimitResetTime(RATE_LIMIT_KEYS.PAYMENT)} сек.`);
      return;
    }
    const minR = selectedMethod.min_amount_kopeks / 100;
    const maxR = selectedMethod.max_amount_kopeks / 100;
    const amtCurr = parseFloat(amount);
    if (isNaN(amtCurr) || amtCurr <= 0) {
      setPayError('Введите сумму');
      return;
    }
    const amtRub = convertToRub(amtCurr);
    if (amtRub < minR || amtRub > maxR) {
      setPayError(`Сумма: ${formatAmount(minR, 0)}–${formatAmount(maxR, 0)} ${currencySymbol}`);
      return;
    }
    const kopeks = Math.round(amtRub * 100);
    if (isStars) starsPayMutation.mutate(kopeks);
    else topUpMutation.mutate(kopeks);
  };

  const isPending = starsPayMutation.isPending || topUpMutation.isPending;
  const minR = selectedMethod ? selectedMethod.min_amount_kopeks / 100 : 0;
  const maxR = selectedMethod ? selectedMethod.max_amount_kopeks / 100 : 0;
  const quickAmounts = [100, 300, 500, 1000].filter((a) => a >= minR && a <= maxR);
  const decimals = targetCurrency === 'IRR' || targetCurrency === 'RUB' ? 0 : 2;
  const qVal = (rub: number) =>
    targetCurrency === 'IRR'
      ? Math.round(convertAmount(rub)).toString()
      : convertAmount(rub).toFixed(decimals);

  const titleMap: Record<BalanceStep, string> = {
    overview: 'Баланс',
    topup: 'Пополнить',
    amount: selectedMethod?.name ?? 'Сумма',
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && handleClose()}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{titleMap[step]}</SheetTitle>
        </SheetHeader>

        {step === 'overview' && (
          <div className="mt-4 space-y-4">
            <div className="rounded-2xl border border-dark-700/50 bg-dark-900/80 p-5 text-center">
              <p className="text-sm text-dark-400">Текущий баланс</p>
              <p className="mt-1 text-4xl font-bold tracking-tight text-dark-50">
                {formatAmount(balanceRubles)} {currencySymbol}
              </p>
            </div>
            <button
              onClick={() => setStep('topup')}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-accent-500 py-3.5 text-sm font-semibold text-dark-950 transition-opacity active:opacity-80"
            >
              <ArrowUpIcon /> Пополнить
            </button>
            {transactions.length > 0 && (
              <div className="space-y-2">
                <p className="px-1 text-xs font-medium uppercase tracking-wide text-dark-500">
                  История операций
                </p>
                <div className="overflow-hidden rounded-2xl border border-dark-700/50 bg-dark-800/40">
                  {transactions.slice(0, 8).map((tx, i) => (
                    <div
                      key={tx.id}
                      className={cn(
                        'flex items-center justify-between px-4 py-3',
                        i < Math.min(transactions.length, 8) - 1 && 'border-b border-dark-700/30',
                      )}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={cn(
                            'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                            tx.amount_rubles >= 0
                              ? 'bg-accent-500/10 text-accent-400'
                              : 'bg-red-500/10 text-red-400',
                          )}
                        >
                          {tx.amount_rubles >= 0 ? <ArrowDownIcon /> : <ArrowUpIcon />}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm text-dark-100">
                            {tx.description || tx.type}
                          </p>
                          <p className="text-xs text-dark-500">
                            {new Date(tx.created_at).toLocaleDateString('ru-RU')}
                          </p>
                        </div>
                      </div>
                      <p
                        className={cn(
                          'shrink-0 text-sm font-medium',
                          tx.amount_rubles >= 0 ? 'text-accent-400' : 'text-dark-200',
                        )}
                      >
                        {tx.amount_rubles >= 0 ? '+' : ''}
                        {formatAmount(tx.amount_rubles)} {currencySymbol}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {step === 'topup' && (
          <div className="mt-4 space-y-4">
            <button
              onClick={() => setStep('overview')}
              className="flex items-center gap-1.5 text-sm text-dark-400 active:text-dark-200"
            >
              ← Назад
            </button>

            {/* Promo code */}
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-dark-500">Промокод</p>
              <div className="flex gap-2">
                <input
                  value={promoCode}
                  onChange={(e) => {
                    setPromoCode(e.target.value.toUpperCase());
                    setPromoResult(null);
                  }}
                  placeholder="ВВЕДИТЕ КОД"
                  className="flex-1 rounded-xl border border-dark-700/50 bg-dark-900/80 px-4 py-2.5 text-sm uppercase tracking-wider text-dark-100 placeholder:text-dark-600 focus:border-accent-500/50 focus:outline-none"
                />
                <button
                  onClick={() => promoMutation.mutate()}
                  disabled={!promoCode.trim() || promoMutation.isPending}
                  className="rounded-xl bg-dark-700 px-4 py-2.5 text-sm font-medium text-dark-200 transition-colors active:bg-dark-600 disabled:opacity-40"
                >
                  {promoMutation.isPending ? '...' : 'Применить'}
                </button>
              </div>
              {promoResult && (
                <p
                  className={cn(
                    'text-sm',
                    promoResult.success ? 'text-accent-400' : 'text-red-400',
                  )}
                >
                  {promoResult.message}
                </p>
              )}
            </div>

            {/* Payment methods */}
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-dark-500">
                Способ оплаты
              </p>
              {methodsLoading ? (
                <div className="space-y-2">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="skeleton h-14 w-full rounded-2xl" />
                  ))}
                </div>
              ) : !paymentMethods?.length ? (
                <p className="py-4 text-center text-sm text-dark-500">Способы оплаты недоступны</p>
              ) : (
                <div className="overflow-hidden rounded-2xl border border-dark-700/50">
                  {paymentMethods.map((m, i) => (
                    <button
                      key={m.id}
                      disabled={!m.is_available}
                      onClick={() => handleSelectMethod(m)}
                      className={cn(
                        'flex w-full items-center justify-between px-4 py-3.5 transition-colors active:bg-dark-800/50',
                        i < paymentMethods.length - 1 && 'border-b border-dark-700/40',
                        !m.is_available && 'cursor-not-allowed opacity-40',
                      )}
                    >
                      <span className="text-sm text-dark-100">{m.name}</span>
                      <ChevronRightIcon />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {step === 'amount' && selectedMethod && (
          <div className="mt-4 space-y-4">
            <button
              onClick={() => setStep('topup')}
              className="flex items-center gap-1.5 text-sm text-dark-400 active:text-dark-200"
            >
              ← Назад
            </button>

            <p className="text-xs text-dark-500">
              {formatAmount(minR, 0)}–{formatAmount(maxR, 0)} {currencySymbol}
            </p>

            {/* Options (without SBP) */}
            {(() => {
              const opts = (selectedMethod.options ?? []).filter((o) => !isSbp(o));
              return (
                opts.length > 1 && (
                  <div className="grid grid-cols-2 gap-2">
                    {opts.map((opt) => (
                      <button
                        key={opt.id}
                        onClick={() => setSelectedOption(opt.id)}
                        className={cn(
                          'rounded-xl px-4 py-3 text-sm font-semibold transition-all',
                          selectedOption === opt.id
                            ? 'bg-accent-500/15 text-accent-400 ring-2 ring-accent-500/40'
                            : 'border border-dark-700/50 bg-dark-900/80 text-dark-300',
                        )}
                      >
                        {opt.name}
                      </button>
                    ))}
                  </div>
                )
              );
            })()}

            {/* Amount input */}
            <div className="flex gap-2">
              <div className="relative flex-1 rounded-2xl border border-dark-700/50 bg-dark-900/80">
                <input
                  type="number"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handlePay()}
                  placeholder="0"
                  className="h-14 w-full bg-transparent px-4 pr-12 text-xl font-bold text-dark-100 placeholder:text-dark-600 focus:outline-none"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-base font-semibold text-dark-500">
                  {currencySymbol}
                </span>
              </div>
              <button
                onClick={handlePay}
                disabled={isPending || !amount || parseFloat(amount) <= 0}
                className="flex h-14 items-center justify-center rounded-2xl bg-accent-500 px-5 text-sm font-bold text-dark-950 active:opacity-80 disabled:opacity-40"
              >
                {isPending ? (
                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-dark-950/30 border-t-dark-950" />
                ) : (
                  'Оплатить'
                )}
              </button>
            </div>

            {/* Quick amounts */}
            {quickAmounts.length > 0 && (
              <div className="grid grid-cols-4 gap-2">
                {quickAmounts.map((a) => {
                  const val = qVal(a);
                  return (
                    <button
                      key={a}
                      onClick={() => setAmount(val)}
                      className={cn(
                        'rounded-xl py-2.5 text-sm font-semibold transition-all',
                        amount === val
                          ? 'bg-accent-500/15 text-accent-400 ring-1 ring-accent-500/40'
                          : 'border border-dark-700/50 bg-dark-900/80 text-dark-300',
                      )}
                    >
                      {formatAmount(a, 0)}
                    </button>
                  );
                })}
              </div>
            )}

            {payError && (
              <p className="rounded-xl bg-red-500/10 p-3 text-center text-sm text-red-400">
                {payError}
              </p>
            )}
            {paymentUrl && (
              <button
                onClick={() => {
                  if (paymentUrl.includes('t.me/')) openTelegramLink(paymentUrl);
                  else openLink(paymentUrl);
                }}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-accent-500/30 bg-accent-500/10 py-3 text-sm font-medium text-accent-400"
              >
                Открыть страницу оплаты →
              </button>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ─── History Sheet ────────────────────────────────────────────────────────────

function HistorySheet({
  open,
  onClose,
  transactions,
  isLoading,
}: {
  open: boolean;
  onClose: () => void;
  transactions: Transaction[];
  isLoading: boolean;
}) {
  const { formatAmount, currencySymbol } = useCurrency();

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>История операций</SheetTitle>
        </SheetHeader>

        <div className="mt-4">
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="skeleton h-14 w-full rounded-2xl" />
              ))}
            </div>
          ) : transactions.length === 0 ? (
            <div className="py-10 text-center text-dark-400">Операций пока нет</div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-dark-700/50 bg-dark-800/40">
              {transactions.map((tx, i) => (
                <div
                  key={tx.id}
                  className={cn(
                    'flex items-center justify-between px-4 py-3',
                    i < transactions.length - 1 && 'border-b border-dark-700/30',
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={cn(
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
                        tx.amount_rubles >= 0
                          ? 'bg-accent-500/10 text-accent-400'
                          : 'bg-red-500/10 text-red-400',
                      )}
                    >
                      {tx.amount_rubles >= 0 ? <ArrowDownIcon /> : <ArrowUpIcon />}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm text-dark-100">{tx.description || tx.type}</p>
                      <p className="text-xs text-dark-500">
                        {new Date(tx.created_at).toLocaleDateString('ru-RU', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                  </div>
                  <p
                    className={cn(
                      'shrink-0 text-sm font-medium',
                      tx.amount_rubles >= 0 ? 'text-accent-400' : 'text-dark-200',
                    )}
                  >
                    {tx.amount_rubles >= 0 ? '+' : ''}
                    {formatAmount(tx.amount_rubles)} {currencySymbol}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Connect Sheet ────────────────────────────────────────────────────────────

function ConnectSheet({
  open,
  onClose,
  subscriptionId,
  hasSubscription,
  onPurchase,
  onOpenQR,
}: {
  open: boolean;
  onClose: () => void;
  subscriptionId?: number;
  hasSubscription: boolean;
  onPurchase: () => void;
  onOpenQR: (url: string, hideLink: boolean) => void;
}) {
  const { i18n } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const isAdmin = useAuthStore((state) => state.isAdmin);
  const { isTelegramWebApp } = useTelegramSDK();

  const { data: appConfig, isLoading } = useQuery<AppConfig>({
    queryKey: ['appConfig', subscriptionId],
    queryFn: () => subscriptionApi.getAppConfig(subscriptionId),
    enabled: open && hasSubscription,
  });

  const { data: connectionLink } = useQuery({
    queryKey: ['connectionLink', subscriptionId],
    queryFn: () => subscriptionApi.getConnectionLink(subscriptionId),
    retry: false,
    staleTime: 0,
    enabled: open && hasSubscription,
  });

  const qrConnectionUrl = useMemo(
    () =>
      resolveConnectionUrlForUi({
        mode: connectionLink?.connect_mode,
        happSchemeLink: connectionLink?.happ_scheme_link,
        displayLink: connectionLink?.display_link,
        subscriptionUrl: connectionLink?.subscription_url,
        happCryptLink: connectionLink?.happ_cryptolink,
        happCryptoLink: connectionLink?.happ_crypto_link,
        happLink: connectionLink?.happ_link,
        fallbackUrl: appConfig?.subscriptionUrl,
      }),
    [appConfig?.subscriptionUrl, connectionLink],
  );

  const resolveUrl = useCallback(
    (url: string): string => {
      if (!hasTemplates(url) || !appConfig?.subscriptionUrl) return url;
      return resolveTemplate(url, {
        subscriptionUrl: appConfig.subscriptionUrl,
        username: user?.username ?? undefined,
      });
    },
    [appConfig, user],
  );

  const openDeepLink = useCallback(
    (deepLink: string) => {
      let resolved = deepLink;
      if (isHappCryptolinkMode(connectionLink?.connect_mode) && qrConnectionUrl) {
        resolved = qrConnectionUrl;
      } else if (hasTemplates(resolved)) {
        resolved = resolveUrl(resolved);
      }
      const isHttp = /^https?:\/\//i.test(resolved);
      const finalUrl = isHttp
        ? resolved
        : `${window.location.origin}/miniapp/redirect.html?url=${encodeURIComponent(resolved)}&lang=${i18n.language || 'en'}`;
      if (isTelegramWebApp) {
        try {
          sdkOpenLink(finalUrl, { tryInstantView: false });
          return;
        } catch {
          /* fallback */
        }
      }
      window.location.href = resolved;
    },
    [isTelegramWebApp, i18n.language, resolveUrl, connectionLink?.connect_mode, qrConnectionUrl],
  );

  const hasApps = useMemo(() => {
    if (!appConfig?.platforms) return false;
    return Object.values(appConfig.platforms).some(
      (p: { apps?: unknown[] }) => p.apps && p.apps.length > 0,
    );
  }, [appConfig?.platforms]);

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="max-h-[92vh]">
        {!hasSubscription ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-base font-semibold text-dark-100">Нет активной подписки</p>
            <p className="mt-1 text-sm text-dark-400">Выберите тариф чтобы начать</p>
            <button
              onClick={onPurchase}
              className="mt-5 rounded-2xl bg-accent-500 px-6 py-3 text-sm font-semibold text-dark-950"
            >
              Выбрать тариф
            </button>
          </div>
        ) : isLoading ? (
          <div className="flex flex-1 items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent-500/30 border-t-accent-500" />
          </div>
        ) : !appConfig || !hasApps ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <p className="text-base font-semibold text-dark-100">
              {isAdmin ? 'Приложения не настроены' : 'Подключение недоступно'}
            </p>
            <p className="mt-2 text-sm text-dark-400">
              {isAdmin ? 'Настройте приложения в панели администратора' : 'Обратитесь в поддержку'}
            </p>
          </div>
        ) : (
          <InstallationGuide
            appConfig={appConfig}
            onOpenDeepLink={openDeepLink}
            isTelegramWebApp={isTelegramWebApp}
            onGoBack={onClose}
            onOpenQR={
              qrConnectionUrl
                ? () =>
                    onOpenQR(
                      qrConnectionUrl,
                      connectionLink?.hide_link ?? appConfig?.hideLink ?? false,
                    )
                : undefined
            }
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

// ─── Tariffs Sheet ────────────────────────────────────────────────────────────

function TariffsSheet({
  open,
  onClose,
  tariffName,
  endDate,
  onRenew,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  tariffName: string | null | undefined;
  endDate: string | null | undefined;
  onRenew: () => void;
  onChange: () => void;
}) {
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Тарифы</SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-3">
          {tariffName && (
            <div className="rounded-2xl border border-dark-700/50 bg-dark-900/80 p-4">
              <p className="text-xs text-dark-500">Текущий тариф</p>
              <p className="mt-1 text-lg font-semibold text-dark-100">{tariffName}</p>
              {endDate && (
                <p className="mt-0.5 text-sm text-dark-400">
                  Действует до {formatDate(endDate)} · ещё {daysUntil(endDate)} дн.
                </p>
              )}
            </div>
          )}

          <button
            onClick={onRenew}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-accent-500 py-3.5 text-sm font-semibold text-dark-950 transition-opacity active:opacity-80"
          >
            Продлить подписку
          </button>

          <button
            onClick={onChange}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dark-700/50 bg-dark-800/50 py-3.5 text-sm font-medium text-dark-200 transition-colors active:bg-dark-700/50"
          >
            Сменить тариф
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Referrals Sheet ──────────────────────────────────────────────────────────

function ReferralsSheet({
  open,
  onClose,
  totalReferrals,
  referralLink,
  earningsRubles,
}: {
  open: boolean;
  onClose: () => void;
  totalReferrals: number;
  referralLink: string | undefined;
  earningsRubles: number;
}) {
  const [copied, setCopied] = useState(false);
  const haptic = useHaptic();
  const { formatAmount, currencySymbol } = useCurrency();

  const handleCopy = async () => {
    if (!referralLink) return;
    await copyToClipboard(referralLink);
    haptic.impact('light');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleShare = () => {
    if (!referralLink) return;
    if (navigator.share) {
      navigator.share({ url: referralLink, title: 'Пригласить друга' }).catch(() => {});
    } else {
      handleCopy();
    }
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Рефералы</SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-dark-700/50 bg-dark-900/80 p-4 text-center">
              <p className="text-3xl font-bold text-dark-50">{totalReferrals}</p>
              <p className="mt-1 text-xs text-dark-400">Рефералов</p>
            </div>
            <div className="rounded-2xl border border-dark-700/50 bg-dark-900/80 p-4 text-center">
              <p className="text-3xl font-bold text-accent-400">{formatAmount(earningsRubles)}</p>
              <p className="mt-1 text-xs text-dark-400">Заработано, {currencySymbol}</p>
            </div>
          </div>

          {referralLink && (
            <div className="rounded-2xl border border-dark-700/50 bg-dark-900/80 p-4">
              <p className="mb-2 text-xs text-dark-500">Реферальная ссылка</p>
              <p className="break-all text-xs text-dark-200">{referralLink}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={handleCopy}
              className={cn(
                'flex items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-semibold transition-all',
                copied
                  ? 'bg-accent-500/20 text-accent-400'
                  : 'bg-accent-500 text-dark-950 active:opacity-80',
              )}
            >
              {copied ? <CheckIcon /> : <CopyIcon />}
              {copied ? 'Скопировано' : 'Копировать'}
            </button>
            <button
              onClick={handleShare}
              className="flex items-center justify-center gap-2 rounded-2xl border border-dark-700/50 bg-dark-800/50 py-3.5 text-sm font-medium text-dark-200 transition-colors active:bg-dark-700/50"
            >
              <ShareIcon />
              Поделиться
            </button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Support Sheet ────────────────────────────────────────────────────────────

function SupportSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { openTelegramLink, openLink } = usePlatform();

  const { data: config } = useQuery({
    queryKey: ['support-config'],
    queryFn: infoApi.getSupportConfig,
    enabled: open,
    staleTime: 5 * 60_000,
  });

  const handleOpenUrl = (url: string) => {
    if (url.startsWith('https://t.me')) {
      openTelegramLink(url);
    } else {
      openLink(url, { tryInstantView: false });
    }
  };

  const supportUrl = config?.support_url ?? null;
  const tgUsername = config?.support_username ?? null;
  const tgUrl = tgUsername ? `https://t.me/${tgUsername.replace('@', '')}` : null;
  const hasTickets = config?.tickets_enabled;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Поддержка</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-3">
          <p className="text-sm text-dark-400">
            Если у вас возникли вопросы или проблемы — напишите нам, мы поможем.
          </p>
          {tgUrl && (
            <button
              onClick={() => handleOpenUrl(tgUrl)}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-accent-500 py-3.5 text-sm font-semibold text-dark-950 transition-opacity active:opacity-80"
            >
              <ChatIcon />
              Написать в Telegram
            </button>
          )}
          {supportUrl && !tgUrl && (
            <button
              onClick={() => handleOpenUrl(supportUrl)}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-accent-500 py-3.5 text-sm font-semibold text-dark-950 transition-opacity active:opacity-80"
            >
              <ChatIcon />
              Написать в поддержку
            </button>
          )}
          {hasTickets && (
            <button
              onClick={() => {
                onClose();
              }}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dark-700/50 bg-dark-800/50 py-3.5 text-sm font-medium text-dark-200 transition-colors active:bg-dark-700/50"
            >
              Мои обращения
            </button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Info Sheet ───────────────────────────────────────────────────────────────

function InfoSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [expandedId, setExpandedId] = useState<number | null>(null);

  const { data: faqPages, isLoading } = useQuery({
    queryKey: ['faq-pages'],
    queryFn: infoApi.getFaqPages,
    enabled: open,
    staleTime: 5 * 60_000,
  });

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Информация</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-2">
          {isLoading ? (
            [...Array(4)].map((_, i) => (
              <div key={i} className="skeleton h-12 w-full rounded-2xl" />
            ))
          ) : !faqPages?.length ? (
            <p className="py-6 text-center text-sm text-dark-500">Нет информации</p>
          ) : (
            faqPages.map((page) => (
              <div
                key={page.id}
                className="overflow-hidden rounded-2xl border border-dark-700/50 bg-dark-800/40"
              >
                <button
                  onClick={() => setExpandedId(expandedId === page.id ? null : page.id)}
                  className="flex w-full items-center justify-between px-4 py-3.5 text-left"
                >
                  <span className="text-sm font-medium text-dark-100">{page.title}</span>
                  <span
                    className={cn(
                      'text-dark-500 transition-transform',
                      expandedId === page.id && 'rotate-180',
                    )}
                  >
                    <svg
                      className="h-4 w-4"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M19.5 8.25l-7.5 7.5-7.5-7.5"
                      />
                    </svg>
                  </span>
                </button>
                {expandedId === page.id && (
                  <div
                    className="prose prose-sm prose-invert max-w-none border-t border-dark-700/40 px-4 py-3 text-sm text-dark-300"
                    dangerouslySetInnerHTML={{ __html: page.content }}
                  />
                )}
              </div>
            ))
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Notifications Sheet ──────────────────────────────────────────────────────

function NotificationsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Уведомления</SheetTitle>
        </SheetHeader>

        <div className="mt-4">
          <p className="text-sm text-dark-400">Настройки уведомлений появятся здесь.</p>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Promo Sheet ─────────────────────────────────────────────────────────────

function PromoSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [code, setCode] = useState('');
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => balanceApi.activatePromocode(code.trim()),
    onSuccess: (data) => {
      const msg = data.success
        ? 'Промокод успешно применён!'
        : 'Промокод недействителен или уже использован';
      setResult({ success: data.success, message: msg });
      if (data.success) {
        setCode('');
        queryClient.invalidateQueries({ queryKey: ['balance'] });
      }
    },
    onError: () => setResult({ success: false, message: 'Не удалось применить промокод' }),
  });

  const handleClose = () => {
    setCode('');
    setResult(null);
    onClose();
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && handleClose()}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Промокод</SheetTitle>
        </SheetHeader>
        <div className="mt-4 space-y-4">
          <p className="text-sm text-dark-400">
            Введите промокод чтобы получить бонус на баланс или скидку на подписку.
          </p>
          <div className="flex gap-2">
            <input
              value={code}
              onChange={(e) => {
                setCode(e.target.value.toUpperCase());
                setResult(null);
              }}
              onKeyDown={(e) => e.key === 'Enter' && code.trim() && mutation.mutate()}
              placeholder="ВВЕДИТЕ КОД"
              className="flex-1 rounded-xl border border-dark-700/50 bg-dark-800/60 px-4 py-3 text-sm uppercase tracking-widest text-dark-100 placeholder:text-dark-600 focus:border-accent-500/50 focus:outline-none"
            />
            <button
              onClick={() => mutation.mutate()}
              disabled={!code.trim() || mutation.isPending}
              className="rounded-xl bg-accent-500 px-5 py-3 text-sm font-semibold text-dark-950 transition-opacity active:opacity-80 disabled:opacity-40"
            >
              {mutation.isPending ? '...' : 'Применить'}
            </button>
          </div>
          {result && (
            <p
              className={cn(
                'text-sm font-medium',
                result.success ? 'text-accent-400' : 'text-red-400',
              )}
            >
              {result.message}
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ─── Trial Card ───────────────────────────────────────────────────────────────

function TrialCard({
  trialInfo,
  isLoading,
  error,
  onActivate,
  balanceRubles,
}: {
  trialInfo: TrialInfo;
  isLoading: boolean;
  error: string | null;
  onActivate: () => void;
  balanceRubles: number;
}) {
  const isFree = !trialInfo.requires_payment;
  const canAfford = !trialInfo.requires_payment || balanceRubles >= trialInfo.price_rubles;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-accent-400/30 bg-dark-800/60 p-4 shadow-[inset_0_0_20px_1px_rgba(75,226,119,0.05)]">
      <div className="pointer-events-none absolute -top-16 left-1/2 h-40 w-40 -translate-x-1/2 rounded-full bg-accent-400/5 blur-2xl" />

      <div className="relative flex flex-col gap-3">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-lg font-semibold text-accent-400">Пробный период</p>
            <p className="text-sm text-dark-400">
              {trialInfo.duration_days} дн.
              {trialInfo.traffic_limit_gb > 0 && ` · ${trialInfo.traffic_limit_gb} ГБ`}
            </p>
          </div>
          <span className="rounded-full bg-accent-500/10 px-2.5 py-1 text-xs font-medium text-accent-400">
            {isFree ? 'Бесплатно' : `${trialInfo.price_rubles} ₽`}
          </span>
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <button
          onClick={onActivate}
          disabled={isLoading || !canAfford}
          className={cn(
            'flex w-full items-center justify-center rounded-xl py-3 text-sm font-semibold transition-opacity',
            canAfford
              ? 'bg-accent-500 text-dark-950 active:opacity-80'
              : 'cursor-not-allowed bg-dark-700 text-dark-500',
            isLoading && 'opacity-60',
          )}
        >
          {isLoading
            ? 'Активируем...'
            : canAfford
              ? 'Активировать пробный период'
              : 'Недостаточно средств'}
        </button>

        {!isFree && !canAfford && (
          <p className="text-center text-xs text-dark-500">
            Нужно {trialInfo.price_rubles} ₽ · у вас {balanceRubles} ₽
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

type ActiveSheet =
  | 'subscription'
  | 'connect'
  | 'balance'
  | 'tariffs'
  | 'renew'
  | 'purchase'
  | 'change'
  | 'referrals'
  | 'history'
  | 'support'
  | 'info'
  | 'notifications'
  | 'promo'
  | 'profile'
  | null;

export default function Dashboard() {
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const refreshUser = useAuthStore((state) => state.refreshUser);
  const isAdmin = useAuthStore((state) => state.isAdmin);
  const haptic = useHaptic();
  const queryClient = useQueryClient();
  const { safeAreaInset, isFullscreen, isMobile } = useTelegramSDK();
  const [trialError, setTrialError] = useState<string | null>(null);

  const [activeSheet, setActiveSheet] = useState<ActiveSheet>(null);
  const [topUpInitialAmount, setTopUpInitialAmount] = useState<number | undefined>(undefined);

  const open = (sheet: ActiveSheet) => {
    haptic.impact('light');
    setActiveSheet(sheet);
  };
  const close = () => setActiveSheet(null);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  // Traffic refresh
  const hasAutoRefreshed = useRef(false);
  const [trafficData, setTrafficData] = useState<{
    traffic_used_gb: number;
    traffic_used_percent: number;
    is_unlimited: boolean;
  } | null>(null);
  const [trafficRefreshCooldown, setTrafficRefreshCooldown] = useState(0);

  // Data queries
  const { data: balanceData } = useQuery({
    queryKey: ['balance'],
    queryFn: balanceApi.getBalance,
    staleTime: API.BALANCE_STALE_TIME_MS,
    refetchOnMount: 'always',
  });

  const { data: transactionsData, isLoading: txLoading } = useQuery({
    queryKey: ['transactions', { per_page: 20 }],
    queryFn: () => balanceApi.getTransactions({ per_page: 20 }),
    staleTime: 60_000,
    enabled: activeSheet === 'balance' || activeSheet === 'history',
  });

  const { data: subscriptionResponse, isLoading: subLoading } = useQuery({
    queryKey: ['subscription'],
    queryFn: () => subscriptionApi.getSubscription(),
    retry: false,
    staleTime: API.BALANCE_STALE_TIME_MS,
    refetchOnMount: 'always',
  });

  const subscription = subscriptionResponse?.subscription ?? null;
  const hasNoSubscription = subscriptionResponse?.has_subscription === false && !subLoading;

  const { data: trialInfo, isLoading: trialLoading } = useQuery({
    queryKey: ['trial-info'],
    queryFn: () => subscriptionApi.getTrialInfo(),
    enabled: hasNoSubscription,
    retry: false,
  });

  const activateTrialMutation = useMutation({
    mutationFn: () => subscriptionApi.activateTrial(),
    onSuccess: () => {
      setTrialError(null);
      queryClient.invalidateQueries({ queryKey: ['subscription'] });
      queryClient.invalidateQueries({ queryKey: ['trial-info'] });
      queryClient.invalidateQueries({ queryKey: ['balance'] });
      refreshUser();
    },
    onError: (error: { response?: { data?: { detail?: string } } }) => {
      setTrialError(error.response?.data?.detail || 'Произошла ошибка');
    },
  });

  const { data: referralInfo } = useQuery({
    queryKey: ['referral-info'],
    queryFn: referralApi.getReferralInfo,
    staleTime: 60_000,
  });

  const refreshTrafficMutation = useMutation({
    mutationFn: () => subscriptionApi.refreshTraffic(subscription?.id),
    onSuccess: (data) => {
      const d = data as {
        traffic_used_gb: number;
        traffic_used_percent: number;
        is_unlimited: boolean;
        rate_limited?: boolean;
        retry_after_seconds?: number;
      };
      setTrafficData({
        traffic_used_gb: d.traffic_used_gb,
        traffic_used_percent: d.traffic_used_percent,
        is_unlimited: d.is_unlimited,
      });
      localStorage.setItem(
        `traffic_refresh_ts_${subscription?.id ?? 'default'}`,
        Date.now().toString(),
      );
      if (d.rate_limited && d.retry_after_seconds) {
        setTrafficRefreshCooldown(d.retry_after_seconds);
      } else {
        setTrafficRefreshCooldown(30);
      }
    },
  });

  useEffect(() => {
    if (!subscription || hasAutoRefreshed.current) return;
    hasAutoRefreshed.current = true;
    const lastRefresh = localStorage.getItem(`traffic_refresh_ts_${subscription?.id ?? 'default'}`);
    const now = Date.now();
    if (lastRefresh && now - parseInt(lastRefresh, 10) < API.TRAFFIC_CACHE_MS) {
      const elapsed = now - parseInt(lastRefresh, 10);
      const remaining = Math.ceil((API.TRAFFIC_CACHE_MS - elapsed) / 1000);
      if (remaining > 0) setTrafficRefreshCooldown(remaining);
      return;
    }
    refreshTrafficMutation.mutate();
  }, [subscription, refreshTrafficMutation]);

  useEffect(() => {
    if (trafficRefreshCooldown <= 0) return;
    const timer = setInterval(() => setTrafficRefreshCooldown((p) => Math.max(0, p - 1)), 1000);
    return () => clearInterval(timer);
  }, [trafficRefreshCooldown]);

  // Derived values
  const balanceRubles = balanceData?.balance_rubles ?? 0;
  const totalReferrals = referralInfo?.total_referrals ?? 0;
  const earningsRubles = referralInfo?.available_balance_rubles ?? 0;
  const referralLink = referralInfo?.referral_link;
  const userName = user?.first_name || user?.username || 'Пользователь';
  const tariffName = subscription?.tariff_name ?? null;
  const endDate = subscription?.end_date ?? null;
  const daysLeft = endDate ? daysUntil(endDate) : null;
  const usedPercent = trafficData?.traffic_used_percent ?? subscription?.traffic_used_percent ?? 0;
  const usedGb = trafficData?.traffic_used_gb ?? subscription?.traffic_used_gb ?? 0;
  const isUnlimited = trafficData?.is_unlimited ?? subscription?.traffic_limit_gb === 0;

  const topSafeArea = isMobile && isFullscreen ? (safeAreaInset?.top ?? 0) : 0;

  // ─── UI ──────────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen" style={{ paddingTop: topSafeArea }}>
      {/* Top Header */}
      <div className="flex h-14 items-center justify-between border-b border-dark-800/50 px-4">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full border border-dark-700 bg-dark-800">
            <UserCircleIcon />
          </div>
          <span className="text-lg font-semibold tracking-tight text-dark-100">
            Привет, {userName}!
          </span>
        </div>
        <button
          onClick={() => open('profile')}
          className="flex h-8 w-8 items-center justify-center rounded-full text-dark-400 transition-colors active:text-accent-400"
        >
          <GearIcon />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex flex-col gap-3 px-4 pb-10 pt-4">
        {/* Subscription Card */}
        {subLoading ? (
          <div className="skeleton h-32 w-full rounded-2xl" />
        ) : subscription ? (
          <button
            onClick={() => open('subscription')}
            className="w-full rounded-2xl border border-accent-400/40 bg-dark-800/60 p-4 text-left shadow-[inset_0_0_20px_1px_rgba(75,226,119,0.05)] transition-opacity active:opacity-80"
          >
            <div className="flex items-center justify-between">
              <span className="text-lg font-semibold text-accent-400">
                {tariffName ?? 'Подписка'}
              </span>
              <GearIcon />
            </div>

            <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-dark-700">
              <div
                className="h-full rounded-full bg-accent-400 transition-all"
                style={{ width: `${Math.min(100, usedPercent)}%` }}
              />
            </div>

            <div className="mt-3 flex items-end justify-between">
              <div>
                <p className="text-base text-dark-100">
                  {isUnlimited ? '∞' : formatTraffic(usedGb)}
                </p>
                <p className="text-sm text-dark-400">Расход трафика</p>
              </div>
              {endDate && (
                <div className="text-right">
                  <p className="text-base text-dark-100">{formatDate(endDate)}</p>
                  <p className="text-sm text-dark-400">Осталось {daysLeft} дн.</p>
                </div>
              )}
            </div>
          </button>
        ) : trialLoading ? (
          <div className="skeleton h-36 w-full rounded-2xl" />
        ) : trialInfo?.is_available ? (
          <TrialCard
            trialInfo={trialInfo}
            isLoading={activateTrialMutation.isPending}
            error={trialError}
            onActivate={() => activateTrialMutation.mutate()}
            balanceRubles={balanceRubles}
          />
        ) : (
          <button
            onClick={() => open('purchase')}
            className="flex w-full flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-dark-600 bg-dark-800/50 py-8 text-center transition-opacity active:opacity-80"
          >
            <span className="text-2xl">🔒</span>
            <span className="text-base font-medium text-dark-200">Нет активной подписки</span>
            <span className="text-sm text-accent-400">Выбрать тариф →</span>
          </button>
        )}

        {/* Action button */}
        <button
          onClick={() => open('connect')}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-accent-500 py-2.5 text-sm font-medium text-dark-950 transition-opacity active:opacity-80"
        >
          <LinkIcon />
          Подключить
        </button>

        {/* Main cards */}
        <div className="grid grid-cols-2 gap-3">
          {/* Balance */}
          <button
            onClick={() => open('balance')}
            className="flex flex-col gap-2 rounded-2xl border border-dark-700 bg-dark-900/80 p-3 text-left transition-opacity active:opacity-80"
          >
            <div className="flex items-center gap-2">
              <WalletIcon />
              <span className="text-xs font-medium text-dark-400">Баланс</span>
            </div>
            <p className="text-2xl font-bold tracking-tight text-dark-100">{balanceRubles} ₽</p>
            <p className="text-base text-accent-400">Пополнить</p>
          </button>

          {/* Tariffs */}
          <button
            onClick={() => open(subscription ? 'tariffs' : 'purchase')}
            className="flex flex-col gap-2 rounded-2xl border border-dark-700 bg-dark-900/80 p-3 text-left transition-opacity active:opacity-80"
          >
            <div className="flex items-center gap-2">
              <GridIcon />
              <span className="text-xs font-medium text-dark-400">Тарифы</span>
            </div>
            <p className="text-sm text-dark-100">
              {subscription ? (
                <>
                  Продление
                  <br />и смена
                </>
              ) : (
                <>
                  Купить
                  <br />
                  подписку
                </>
              )}
            </p>
          </button>
        </div>

        {/* Secondary rows */}
        <p className="mt-6 px-1 text-[11px] font-medium uppercase tracking-widest text-dark-500">
          Дополнительно
        </p>
        <div className="overflow-hidden rounded-2xl border border-dark-700/50 bg-dark-800/50">
          <button
            onClick={() => open('referrals')}
            className="flex w-full items-center justify-between border-b border-dark-700/40 px-4 py-2.5 transition-colors active:bg-dark-800/40"
          >
            <div className="flex items-center gap-2.5">
              <span className="text-dark-100">
                <UsersIcon />
              </span>
              <span className="text-sm text-dark-100">Рефералы</span>
            </div>
            <div className="flex items-center gap-1.5 text-dark-400">
              <span className="text-sm">{totalReferrals}</span>
              <ChevronRightIcon />
            </div>
          </button>
          <button
            onClick={() => open('history')}
            className="flex w-full items-center justify-between border-b border-dark-700/40 px-4 py-2.5 transition-colors active:bg-dark-800/40"
          >
            <div className="flex items-center gap-2.5">
              <span className="text-dark-100">
                <ClockIcon />
              </span>
              <span className="text-sm text-dark-100">История операций</span>
            </div>
            <span className="text-dark-400">
              <ChevronRightIcon />
            </span>
          </button>
          <button
            onClick={() => open('promo')}
            className="flex w-full items-center justify-between border-b border-dark-700/40 px-4 py-2.5 transition-colors active:bg-dark-800/40"
          >
            <div className="flex items-center gap-2.5">
              <span className="text-dark-100">
                <TagIcon />
              </span>
              <span className="text-sm text-dark-100">Промокод</span>
            </div>
            <span className="text-dark-400">
              <ChevronRightIcon />
            </span>
          </button>
          <button
            onClick={() => open('support')}
            className="flex w-full items-center justify-between border-b border-dark-700/40 px-4 py-2.5 transition-colors active:bg-dark-800/40"
          >
            <div className="flex items-center gap-2.5">
              <span className="text-dark-100">
                <ChatIcon />
              </span>
              <span className="text-sm text-dark-100">Поддержка</span>
            </div>
            <span className="text-dark-400">
              <ChevronRightIcon />
            </span>
          </button>
          <button
            onClick={() => open('info')}
            className="flex w-full items-center justify-between border-b border-dark-700/40 px-4 py-2.5 transition-colors active:bg-dark-800/40"
          >
            <div className="flex items-center gap-2.5">
              <span className="text-dark-100">
                <InfoCircleIcon />
              </span>
              <span className="text-sm text-dark-100">Информация</span>
            </div>
            <span className="text-dark-400">
              <ChevronRightIcon />
            </span>
          </button>
          <button
            onClick={() => open('notifications')}
            className={`flex w-full items-center justify-between px-4 py-2.5 transition-colors active:bg-dark-800/40 ${isAdmin ? 'border-b border-dark-700/40' : ''}`}
          >
            <div className="flex items-center gap-2.5">
              <span className="text-dark-100">
                <BellIcon />
              </span>
              <span className="text-sm text-dark-100">Уведомления</span>
            </div>
            <span className="text-dark-400">
              <ChevronRightIcon />
            </span>
          </button>
          {isAdmin && (
            <button
              onClick={() => navigate('/admin')}
              className="flex w-full items-center justify-between px-4 py-2.5 transition-colors active:bg-dark-800/40"
            >
              <div className="flex items-center gap-2.5">
                <span className="text-warning-500/80">
                  <ShieldIcon />
                </span>
                <span className="text-sm text-warning-400">Панель администратора</span>
              </div>
              <span className="text-dark-400">
                <ChevronRightIcon />
              </span>
            </button>
          )}
        </div>
      </div>

      {/* ─── Sheet Modals ─────────────────────────────────────────────────── */}

      <BalanceSheet
        open={activeSheet === 'balance'}
        onClose={() => {
          setTopUpInitialAmount(undefined);
          close();
        }}
        balanceRubles={balanceRubles}
        transactions={transactionsData?.items ?? []}
        initialAmount={topUpInitialAmount}
      />

      <HistorySheet
        open={activeSheet === 'history'}
        onClose={close}
        transactions={transactionsData?.items ?? []}
        isLoading={txLoading}
      />

      <ConnectSheet
        open={activeSheet === 'connect'}
        onClose={close}
        subscriptionId={subscription?.id}
        hasSubscription={!!subscription}
        onPurchase={() => setActiveSheet('purchase')}
        onOpenQR={(url, hideLink) => {
          close();
          navigate('/connection/qr', {
            state: { url, hideLink, subscriptionId: subscription?.id },
          });
        }}
      />

      <TariffsSheet
        open={activeSheet === 'tariffs'}
        onClose={close}
        tariffName={tariffName}
        endDate={endDate}
        onRenew={() => setActiveSheet('renew')}
        onChange={() => setActiveSheet('change')}
      />

      <ReferralsSheet
        open={activeSheet === 'referrals'}
        onClose={close}
        totalReferrals={totalReferrals}
        referralLink={referralLink}
        earningsRubles={earningsRubles}
      />

      <SupportSheet open={activeSheet === 'support'} onClose={close} />

      <InfoSheet open={activeSheet === 'info'} onClose={close} />

      <NotificationsSheet open={activeSheet === 'notifications'} onClose={close} />

      <PromoSheet open={activeSheet === 'promo'} onClose={close} />

      <Sheet open={activeSheet === 'subscription'} onOpenChange={(o) => !o && close()}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{tariffName ?? 'Подписка'}</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-3">
            {endDate && (
              <div className="rounded-2xl border border-dark-700/50 bg-dark-900/80 p-4">
                <div className="flex justify-between text-sm">
                  <span className="text-dark-400">Действует до</span>
                  <span className="text-dark-100">{formatDate(endDate)}</span>
                </div>
                <div className="mt-1 flex justify-between text-sm">
                  <span className="text-dark-400">Осталось</span>
                  <span className="text-dark-100">{daysLeft} дн.</span>
                </div>
                <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-dark-700">
                  <div
                    className="h-full rounded-full bg-accent-400"
                    style={{ width: `${Math.min(100, usedPercent)}%` }}
                  />
                </div>
                <div className="mt-2 flex justify-between text-sm">
                  <span className="text-dark-400">
                    {isUnlimited ? 'Безлимит' : `Использовано ${formatTraffic(usedGb)}`}
                  </span>
                  <span className="text-dark-400">{Math.round(usedPercent)}%</span>
                </div>
              </div>
            )}
            <button
              onClick={() => setActiveSheet('connect')}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-accent-500 py-3.5 text-sm font-semibold text-dark-950 transition-opacity active:opacity-80"
            >
              Подключить устройство
            </button>
            <button
              onClick={() => setActiveSheet('renew')}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dark-700/50 bg-dark-800/50 py-3.5 text-sm font-medium text-dark-200 transition-colors active:bg-dark-700/50"
            >
              Продлить подписку
            </button>
          </div>
        </SheetContent>
      </Sheet>

      <ProfileSheet
        open={activeSheet === 'profile'}
        onClose={close}
        onLogout={() => {
          close();
          logout();
        }}
      />

      <RenewSheet
        open={activeSheet === 'renew'}
        onClose={close}
        subscriptionId={subscription?.id}
        onSuccess={() => {
          close();
          queryClient.invalidateQueries({ queryKey: ['subscription'] });
          queryClient.invalidateQueries({ queryKey: ['balance'] });
          queryClient.invalidateQueries({ queryKey: ['subscriptions-list'] });
        }}
        onSelectTariff={() => setActiveSheet('purchase')}
        onTopUp={(amt) => {
          setTopUpInitialAmount(amt);
          setActiveSheet('balance');
        }}
      />

      <PurchaseSheet
        open={activeSheet === 'purchase'}
        onClose={close}
        subscriptionId={subscription?.id}
        mode="purchase"
        onTopUp={(amt) => {
          setTopUpInitialAmount(amt);
          setActiveSheet('balance');
        }}
        onSuccess={() => {
          close();
          queryClient.invalidateQueries({ queryKey: ['subscription'] });
          queryClient.invalidateQueries({ queryKey: ['balance'] });
          queryClient.invalidateQueries({ queryKey: ['subscriptions-list'] });
        }}
      />

      <PurchaseSheet
        open={activeSheet === 'change'}
        onClose={close}
        subscriptionId={subscription?.id}
        mode="change"
        onTopUp={(amt) => {
          setTopUpInitialAmount(amt);
          setActiveSheet('balance');
        }}
        onSuccess={() => {
          close();
          queryClient.invalidateQueries({ queryKey: ['subscription'] });
          queryClient.invalidateQueries({ queryKey: ['balance'] });
          queryClient.invalidateQueries({ queryKey: ['subscriptions-list'] });
        }}
      />
    </div>
  );
}

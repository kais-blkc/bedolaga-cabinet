import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { subscriptionApi } from '../../../api/subscription';
import { useCurrency } from '../../../hooks/useCurrency';
import { useHaptic } from '@/platform';
import InsufficientBalancePrompt from '../../InsufficientBalancePrompt';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/primitives/Sheet/Sheet';

interface RenewSheetProps {
  open: boolean;
  onClose: () => void;
  subscriptionId?: number;
  onSuccess: () => void;
  onSelectTariff?: () => void;
  onTopUp?: (amountRubles: number) => void;
}

export default function RenewSheet({
  open,
  onClose,
  subscriptionId,
  onSuccess,
  onSelectTariff,
  onTopUp,
}: RenewSheetProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { formatAmount, currencySymbol } = useCurrency();
  const haptic = useHaptic();

  const [selectedPeriod, setSelectedPeriod] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load renewal options
  const { data: options, isLoading } = useQuery({
    queryKey: ['renewal-options', subscriptionId],
    queryFn: () => subscriptionApi.getRenewalOptions(subscriptionId),
    enabled: open && !!subscriptionId,
    staleTime: 0,
    refetchOnMount: 'always',
  });

  // Load balance
  const { data: purchaseOptions } = useQuery({
    queryKey: ['purchase-options', subscriptionId],
    queryFn: () => subscriptionApi.getPurchaseOptions(subscriptionId),
    enabled: open,
    staleTime: 0,
  });
  const balanceKopeks = purchaseOptions?.balance_kopeks ?? 0;

  const renewMutation = useMutation({
    mutationFn: (periodDays: number) =>
      subscriptionApi.renewSubscription(periodDays, subscriptionId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscription'] });
      queryClient.invalidateQueries({ queryKey: ['subscription', subscriptionId] });
      queryClient.invalidateQueries({ queryKey: ['subscriptions-list'] });
      queryClient.invalidateQueries({ queryKey: ['renewal-options', subscriptionId] });
      queryClient.invalidateQueries({ queryKey: ['balance'] });
      setSelectedPeriod(null);
      setError(null);
      onSuccess();
    },
    onError: (err: unknown) => {
      const detail =
        err && typeof err === 'object' && 'response' in err
          ? ((err as { response?: { data?: { detail?: unknown } } }).response?.data?.detail ?? null)
          : null;

      if (detail && typeof detail === 'object' && 'code' in (detail as Record<string, unknown>)) {
        const typed = detail as { code: string; missing_amount?: number };
        if (typed.code === 'insufficient_funds' && typed.missing_amount) {
          setError(`insufficient:${typed.missing_amount}`);
          return;
        }
      }
      setError(typeof detail === 'string' ? detail : t('common.error'));
    },
  });

  const handleRenew = (periodDays: number) => {
    haptic.impact('medium');
    setError(null);
    renewMutation.mutate(periodDays);
  };

  const handleClose = () => {
    setSelectedPeriod(null);
    setError(null);
    onClose();
  };

  const insufficientMatch = error?.match(/^insufficient:(\d+)$/);
  const missingAmount = insufficientMatch ? Number(insufficientMatch[1]) : null;

  return (
    <Sheet open={open} onOpenChange={(o) => !o && handleClose()}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{t('subscription.extend', 'Продлить подписку')}</SheetTitle>
        </SheetHeader>

        <div className="mt-4 space-y-4">
          {/* Balance */}
          <div className="flex items-center justify-between rounded-2xl border border-dark-700/50 bg-dark-800/60 p-4">
            <span className="text-sm text-dark-400">{t('common.balance', 'Баланс')}</span>
            <span className="text-base font-semibold text-dark-100">
              {formatAmount(balanceKopeks / 100)} {currencySymbol}
            </span>
          </div>

          {/* Period options */}
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent-500 border-t-transparent" />
            </div>
          ) : !options || options.length === 0 ? (
            <div className="space-y-4 rounded-2xl border border-dark-700/50 bg-dark-800/60 p-6 text-center">
              <p className="text-dark-400">
                {t('subscription.noRenewalOptions', 'Нет доступных вариантов продления')}
              </p>
              {onSelectTariff && (
                <button
                  onClick={onSelectTariff}
                  className="w-full rounded-2xl bg-accent-500 py-3 text-sm font-semibold text-dark-950 transition-opacity active:opacity-80"
                >
                  Выбрать тариф
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {options.map((option) => {
                const isSelected = selectedPeriod === option.period_days;
                const canAfford = balanceKopeks >= option.price_kopeks;
                const months = Math.max(1, Math.round(option.period_days / 30));
                const perMonth = option.price_kopeks / months;

                return (
                  <button
                    key={option.period_days}
                    onClick={() => {
                      haptic.impact('light');
                      setSelectedPeriod(option.period_days);
                      setError(null);
                    }}
                    className="w-full rounded-2xl border p-4 text-left transition-all duration-200"
                    style={{
                      background: isSelected ? 'rgba(var(--color-accent-400), 0.08)' : undefined,
                      borderColor: isSelected ? 'rgb(var(--color-accent-400))' : undefined,
                    }}
                    data-selected={isSelected}
                  >
                    <div
                      className={`rounded-2xl border p-0 ${isSelected ? 'bg-accent-400/8 border-accent-400/60' : 'border-transparent'}`}
                    />
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="text-base font-semibold text-dark-100">
                          {option.period_days} {t('common.units.days', 'дней')}
                        </span>
                        {option.discount_percent > 0 && (
                          <span className="ml-2 rounded-full bg-emerald-400/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                            -{option.discount_percent}%
                          </span>
                        )}
                      </div>
                      <div className="text-right">
                        <div className="text-base font-semibold text-dark-100">
                          {option.price_kopeks === 0
                            ? t('subscription.free', 'Бесплатно')
                            : `${formatAmount(option.price_kopeks / 100)} ${currencySymbol}`}
                        </div>
                        {months > 1 && (
                          <div className="text-[11px] text-dark-400">
                            {formatAmount(perMonth / 100)} {currencySymbol}/
                            {t('common.units.mo', 'мес')}
                          </div>
                        )}
                        {option.original_price_kopeks && (
                          <div className="text-[11px] text-dark-400 line-through">
                            {formatAmount(option.original_price_kopeks / 100)} {currencySymbol}
                          </div>
                        )}
                      </div>
                    </div>
                    {!canAfford && (
                      <div className="mt-1 text-[11px] text-red-400">
                        {t(
                          'subscription.insufficientBalanceAmount',
                          'Недостаточно средств. Не хватает {{missing}}',
                          {
                            missing: `${formatAmount((option.price_kopeks - balanceKopeks) / 100)} ${currencySymbol}`,
                          },
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Insufficient balance prompt */}
          {missingAmount && (
            <InsufficientBalancePrompt
              missingAmountKopeks={missingAmount}
              compact
              onTopUp={onTopUp}
            />
          )}

          {/* Error */}
          {error && !missingAmount && (
            <div className="rounded-xl bg-red-400/10 p-3 text-center text-sm text-red-400">
              {error}
            </div>
          )}

          {/* Renew button */}
          {selectedPeriod && (
            <button
              onClick={() => handleRenew(selectedPeriod)}
              disabled={renewMutation.isPending}
              className="w-full rounded-2xl bg-accent-500 py-3.5 text-base font-semibold text-dark-950 transition-colors hover:bg-accent-600 disabled:opacity-50"
            >
              {renewMutation.isPending
                ? t('common.processing', 'Обработка...')
                : t('subscription.extend', 'Продлить подписку')}
            </button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

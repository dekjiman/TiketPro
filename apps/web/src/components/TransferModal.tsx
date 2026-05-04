'use client';

import { useState, useEffect } from 'react';
import { api, getApiError } from '@/lib/api';
import { Button, Input, Textarea } from '@/components/ui';
import { Loader2, CheckCircle2, Send } from 'lucide-react';
import { toast } from 'sonner';
import axios from 'axios';

interface TransferModalProps {
  ticketId: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

type Step = 'form' | 'confirm' | 'success';

interface RecipientInfo {
  name: string;
  email: string;
}

export function TransferModal({ ticketId, isOpen, onClose, onSuccess }: TransferModalProps) {
  const [step, setStep] = useState<Step>('form');
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [recipientInfo, setRecipientInfo] = useState<RecipientInfo | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [apiError, setApiError] = useState<string | null>(null);
  const [canResendPending, setCanResendPending] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setStep('form');
      setEmail('');
      setMessage('');
      setRecipientInfo(null);
      setEmailError(null);
      setApiError(null);
      setCanResendPending(false);
    }
  }, [isOpen]);

  const handleEmailBlur = async () => {
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      setEmailError('Format email tidak valid');
      setRecipientInfo(null);
      return;
    }
    setEmailError(null);
    setRecipientInfo({
      name: normalizedEmail.split('@')[0] || normalizedEmail,
      email: normalizedEmail,
    });
  };

  const handleSubmitInitiate = async () => {
    if (!recipientInfo) return;

    setStep('confirm');
  };

  const handleConfirmTransfer = async () => {
    setLoading(true);
    setApiError(null);
    setCanResendPending(false);

    try {
      await api.post(`/api/tickets/${ticketId}/transfer/initiate`, {
        recipientEmail: email,
        message: message || undefined,
      });

      setStep('success');
      onSuccess?.();
    } catch (err) {
      const rawErrorCode = axios.isAxiosError(err)
        ? ((err.response?.data as any)?.code || (err.response?.data as any)?.error || '')
        : '';
      const error = getApiError(err);
      setApiError(error.error);
      setCanResendPending(rawErrorCode === 'TRANSFER_ALREADY_PENDING');
    } finally {
      setLoading(false);
    }
  };

  const handleResendPendingTransfer = async () => {
    setLoading(true);
    try {
      await api.post(`/api/tickets/${ticketId}/transfer/resend`);
      toast.success('Undangan transfer berhasil dikirim ulang');
      setApiError(null);
      setCanResendPending(false);
    } catch (err) {
      const error = getApiError(err);
      toast.error(error.message || 'Gagal mengirim ulang undangan transfer');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={handleClose} />
      <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
        <button
          className="absolute top-4 right-4 p-1 rounded-full hover:bg-gray-100"
          onClick={handleClose}
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>

        <div className="p-6">
          <h2 className="text-xl font-semibold mb-4">Transfer Tiket</h2>

          <div className="flex items-center gap-2 mb-6">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step === 'form' ? 'bg-blue-600 text-white' : 'bg-green-600 text-white'}`}>
              {step === 'form' ? '1' : <CheckCircle2 className="w-5 h-5" />}
            </div>
            <div className="flex-1 h-0.5 bg-gray-200">
              <div className={`h-full ${step !== 'form' ? 'bg-green-600' : ''} transition-all`} style={{ width: step === 'form' ? '0%' : '100%' }} />
            </div>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step === 'confirm' ? 'bg-blue-600 text-white' : step === 'success' ? 'bg-green-600 text-white' : 'bg-gray-200'}`}>
              {step === 'success' ? <CheckCircle2 className="w-5 h-5" /> : '2'}
            </div>
            <div className="flex-1 h-0.5 bg-gray-200">
              <div className={`h-full ${step === 'success' ? 'bg-green-600' : ''} transition-all`} style={{ width: step === 'success' ? '100%' : '0%' }} />
            </div>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step === 'success' ? 'bg-green-600 text-white' : 'bg-gray-200'}`}>
              3
            </div>
          </div>

          {step === 'form' && (
            <>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Email Penerima</label>
                  <Input
                    type="email"
                    placeholder="email@penerima.com"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setRecipientInfo(null);
                      setEmailError(null);
                    }}
                    onBlur={handleEmailBlur}
                    disabled={loading}
                    className={emailError ? 'border-red-500' : ''}
                  />
                  {emailError && (
                    <p className="text-sm text-red-500 mt-1">{emailError}</p>
                  )}
                  {recipientInfo && (
                    <p className="text-sm text-green-600 mt-1 flex items-center gap-1">
                      Kirim ke: {recipientInfo.email}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">
                    Pesan (Opsional)
                  </label>
                  <Textarea
                    placeholder="Pesan untuk penerima..."
                    value={message}
                    onChange={(e) => setMessage(e.target.value.slice(0, 200))}
                    maxLength={200}
                  />
                  <p className="text-xs text-gray-500 mt-1">{message.length}/200</p>
                </div>
              </div>

              <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                <p className="text-sm text-yellow-800">
                  ⚠️ Tiket tidak bisa dikembalikan setelah transfer dikonfirmasi penerima.
                </p>
              </div>

              {apiError && (
                <div className="mt-3 space-y-2">
                  <p className="text-sm text-red-500">{apiError}</p>
                  {canResendPending && (
                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleResendPendingTransfer}
                      disabled={loading}
                      className="w-full"
                    >
                      {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                      Resend Undangan Transfer
                    </Button>
                  )}
                </div>
              )}

              <div className="mt-6 flex gap-2">
                <Button variant="outline" onClick={handleClose} className="flex-1">
                  Batal
                </Button>
                <Button
                  onClick={handleSubmitInitiate}
                  disabled={!email.trim() || !!emailError || loading}
                  className="flex-1"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Send className="w-4 h-4 mr-2" />}
                  Lanjut
                </Button>
              </div>
            </>
          )}

          {step === 'confirm' && (
            <>
              <div className="space-y-4">
                <div className="p-4 bg-gray-50 rounded-lg">
                  <h3 className="font-medium mb-2">Summary Transfer</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500">Kepada</span>
                      <span className="font-medium">{recipientInfo?.email || email}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500">Email</span>
                      <span className="font-medium">{recipientInfo?.email || email}</span>
                    </div>
                    {message && (
                      <div className="flex justify-between">
                        <span className="text-gray-500">Pesan</span>
                        <span className="font-medium">{message}</span>
                      </div>
                    )}
                  </div>
                </div>

                <p className="text-sm text-gray-600">
                  Pastikan data di atas sudah benar. Penerima akan menerima notifikasi dan harus menerima dalam 24 jam.
                </p>
              </div>

              {apiError && (
                <p className="text-sm text-red-500 mt-3">{apiError}</p>
              )}

              <div className="mt-6 flex gap-2">
                <Button variant="outline" onClick={() => setStep('form')} disabled={loading} className="flex-1">
                  Kembali
                </Button>
                <Button onClick={handleConfirmTransfer} disabled={loading} className="flex-1">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                  Ya, Transfer Sekarang
                </Button>
              </div>
            </>
          )}

          {step === 'success' && (
            <>
              <div className="text-center py-4">
                <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 className="w-8 h-8 text-green-600" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Permintaan Transfer Dikirim</h3>
                <p className="text-gray-600 mb-4">
                  Permintaan transfer dikirim ke <strong>{recipientInfo?.email || email}</strong>
                </p>
                <p className="text-sm text-gray-500">
                  Pemegang punya 24 jam untuk menerima transfer
                </p>
              </div>

              <Button onClick={handleClose} className="w-full">
                Tutup
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

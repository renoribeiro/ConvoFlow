import React, { useState, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { validateNodeData } from '@/lib/validations/chatbot-flow';
import { useSupabaseQuery } from '@/hooks/useSupabaseQuery';
import type { TransferAgentNodeData } from '@/types/chatbot-flow.types';

interface Props {
  data: TransferAgentNodeData;
  onChange: (patch: Partial<TransferAgentNodeData>) => void;
}

const TransferAgentPanel: React.FC<Props> = ({ data, onChange }) => {
  const [errors, setErrors] = useState<Record<string, string>>({});

  const { data: profiles = [] } = useSupabaseQuery({
    table: 'profiles',
    queryKey: ['profiles', 'agents'],
    select: 'user_id, full_name, email',
  });

  const validate = (d: TransferAgentNodeData) => {
    const r = validateNodeData('transfer_agent', d);
    if (!r.success) {
      const errs: Record<string, string> = {};
      r.error.errors.forEach((e) => { errs[e.path.join('.')] = e.message; });
      setErrors(errs);
    } else {
      setErrors({});
    }
  };

  useEffect(() => { validate(data); }, []);

  const emit = (patch: Partial<TransferAgentNodeData>) => {
    const next = { ...data, ...patch };
    onChange(patch);
    validate(next);
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <Label>Mensagem de transferência</Label>
        <Textarea
          value={data.message ?? ''}
          onChange={(e) => emit({ message: e.target.value })}
          placeholder="Transferindo para um atendente..."
          rows={3}
        />
      </div>

      <div className="space-y-1">
        <Label>Transferir para</Label>
        <Select value={data.assign_to} onValueChange={(v) => emit({ assign_to: v as any, user_id: null })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="any">Qualquer atendente disponível</SelectItem>
            <SelectItem value="specific_user">Atendente específico</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {data.assign_to === 'specific_user' && (
        <div className="space-y-1">
          <Label>Atendente *</Label>
          <Select
            value={data.user_id ?? ''}
            onValueChange={(v) => emit({ user_id: v || null })}
          >
            <SelectTrigger className={errors.user_id ? 'border-destructive' : ''}>
              <SelectValue placeholder="Selecione o atendente" />
            </SelectTrigger>
            <SelectContent>
              {(profiles as any[]).map((p) => (
                <SelectItem key={p.user_id} value={p.user_id}>
                  {p.full_name ?? p.email ?? p.user_id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.user_id && <p className="text-xs text-destructive">{errors.user_id}</p>}
        </div>
      )}
    </div>
  );
};

export default TransferAgentPanel;

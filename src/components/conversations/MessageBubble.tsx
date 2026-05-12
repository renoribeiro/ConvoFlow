import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Check,
  CheckCheck,
  Clock,
  Download,
  ExternalLink,
  FileText,
  MapPin,
  Mic,
  Trash2,
  Video,
  XCircle,
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export type RenderableMessage = {
  id: string;
  content: string | null;
  created_at: string;
  direction: 'inbound' | 'outbound';
  status: 'sent' | 'delivered' | 'read' | 'failed' | 'pending';
  message_type: string; // 'text' | 'image' | 'audio' | 'video' | 'document' | 'sticker' | 'location' | 'reaction' | 'contact' | 'deleted' | ...
  media_url?: string | null;
  // Optional metadata fields some webhooks store inside content as JSON.
  metadata?: Record<string, unknown> | null;
  quoted?: {
    id: string;
    content?: string | null;
    sender?: string | null;
  } | null;
};

const StatusIcon = ({ status }: { status: RenderableMessage['status'] }) => {
  switch (status) {
    case 'pending':
      return <Clock className="w-3 h-3 opacity-60" aria-label="Pendente" />;
    case 'sent':
      return <Check className="w-3 h-3 opacity-70" aria-label="Enviado" />;
    case 'delivered':
      return <CheckCheck className="w-3 h-3 opacity-70" aria-label="Entregue" />;
    case 'read':
      return <CheckCheck className="w-3 h-3 text-sky-400" aria-label="Lido" />;
    case 'failed':
      return <XCircle className="w-3 h-3 text-destructive" aria-label="Falhou" />;
    default:
      return null;
  }
};

function tryParseMetadata(message: RenderableMessage): Record<string, any> {
  if (message.metadata) return message.metadata as Record<string, any>;
  if (typeof message.content === 'string' && message.content.startsWith('{')) {
    try {
      return JSON.parse(message.content);
    } catch {
      return {};
    }
  }
  return {};
}

function MediaImage({ url, caption, onOpen }: { url: string; caption?: string | null; onOpen: () => void }) {
  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={onOpen}
        className="block max-w-[280px] rounded-md overflow-hidden border border-border/40"
      >
        <img src={url} alt={caption ?? 'Imagem enviada'} className="max-h-[260px] w-auto object-cover" loading="lazy" />
      </button>
      {caption && <p className="text-sm whitespace-pre-wrap">{caption}</p>}
    </div>
  );
}

function MediaVideo({ url, caption }: { url: string; caption?: string | null }) {
  return (
    <div className="space-y-2">
      <video controls className="max-w-[280px] rounded-md border border-border/40" preload="metadata">
        <source src={url} />
        Seu navegador não suporta vídeo.
      </video>
      {caption && <p className="text-sm whitespace-pre-wrap">{caption}</p>}
    </div>
  );
}

function MediaAudio({ url, isPtt }: { url: string; isPtt: boolean }) {
  return (
    <div className="flex items-center gap-2 min-w-[200px]">
      {isPtt && <Mic className="w-4 h-4 opacity-70" aria-label="Mensagem de voz" />}
      <audio controls preload="metadata" src={url} className="w-full max-w-[260px]">
        Seu navegador não suporta áudio.
      </audio>
    </div>
  );
}

function MediaDocument({ url, fileName, caption }: { url: string; fileName?: string | null; caption?: string | null }) {
  return (
    <div className="space-y-2">
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 px-3 py-2 rounded-md border border-border/40 bg-background/40 hover:bg-background/70"
      >
        <FileText className="w-5 h-5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{fileName || 'Documento'}</p>
          <p className="text-xs opacity-70">Toque para abrir / baixar</p>
        </div>
        <Download className="w-4 h-4 opacity-70" />
      </a>
      {caption && <p className="text-sm whitespace-pre-wrap">{caption}</p>}
    </div>
  );
}

function MediaLocation({ latitude, longitude, name, address }: {
  latitude: number;
  longitude: number;
  name?: string;
  address?: string;
}) {
  const href = `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-2 px-3 py-2 rounded-md border border-border/40 bg-background/40 hover:bg-background/70"
    >
      <MapPin className="w-5 h-5 text-sky-500" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{name || 'Localização compartilhada'}</p>
        <p className="text-xs opacity-70 truncate">{address || `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`}</p>
      </div>
      <ExternalLink className="w-4 h-4 opacity-70" />
    </a>
  );
}

function MediaContact({ name, phone }: { name?: string; phone?: string }) {
  return (
    <div className="px-3 py-2 rounded-md border border-border/40 bg-background/40 min-w-[180px]">
      <p className="text-sm font-medium">{name || 'Contato'}</p>
      {phone && <p className="text-xs opacity-70">{phone}</p>}
    </div>
  );
}

function MediaSticker({ url }: { url: string }) {
  return <img src={url} alt="Sticker" className="w-32 h-32 object-contain" />;
}

function ReactionPlaceholder({ emoji }: { emoji?: string }) {
  return (
    <p className="text-sm italic opacity-80">
      Reagiu com {emoji || '👍'}
    </p>
  );
}

function DeletedPlaceholder() {
  return (
    <p className="text-sm italic opacity-60 flex items-center gap-2">
      <Trash2 className="w-3 h-3" />
      Esta mensagem foi apagada.
    </p>
  );
}

interface MessageBubbleProps {
  message: RenderableMessage;
  /**
   * Quando definido, mostra o conteúdo da mensagem citada acima da bolha.
   */
  showQuoted?: boolean;
  onReply?: (message: RenderableMessage) => void;
}

export function MessageBubble({ message, showQuoted = true, onReply }: MessageBubbleProps) {
  const isOutbound = message.direction === 'outbound';
  const meta = useMemo(() => tryParseMetadata(message), [message]);
  const [imageOpen, setImageOpen] = useState(false);

  const type = (message.message_type || 'text').toLowerCase();
  const url = message.media_url ?? (typeof meta.media_url === 'string' ? meta.media_url : undefined);
  const caption = (typeof meta.caption === 'string' ? meta.caption : undefined) ?? message.content ?? undefined;
  const fileName = (typeof meta.file_name === 'string' ? meta.file_name : undefined) ?? (typeof meta.fileName === 'string' ? meta.fileName : undefined);

  const renderBody = () => {
    if (type === 'deleted' || meta.deleted === true) return <DeletedPlaceholder />;
    if (type === 'reaction') return <ReactionPlaceholder emoji={typeof meta.emoji === 'string' ? meta.emoji : message.content ?? undefined} />;

    if (type === 'image' && url) {
      return <MediaImage url={url} caption={caption ?? null} onOpen={() => setImageOpen(true)} />;
    }
    if (type === 'video' && url) {
      return <MediaVideo url={url} caption={caption ?? null} />;
    }
    if (type === 'audio' && url) {
      const isPtt = Boolean(meta.ptt) || Boolean(meta.is_ptt);
      return <MediaAudio url={url} isPtt={isPtt} />;
    }
    if (type === 'document' && url) {
      return <MediaDocument url={url} fileName={fileName} caption={caption ?? null} />;
    }
    if (type === 'sticker' && url) {
      return <MediaSticker url={url} />;
    }
    if (type === 'location') {
      const lat = Number(meta.latitude);
      const lng = Number(meta.longitude);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        return (
          <MediaLocation
            latitude={lat}
            longitude={lng}
            name={typeof meta.name === 'string' ? meta.name : undefined}
            address={typeof meta.address === 'string' ? meta.address : undefined}
          />
        );
      }
    }
    if (type === 'contact') {
      return (
        <MediaContact
          name={typeof meta.name === 'string' ? meta.name : undefined}
          phone={typeof meta.phone === 'string' ? meta.phone : undefined}
        />
      );
    }

    // Default: text
    return <p className="text-sm whitespace-pre-wrap break-words">{message.content || ''}</p>;
  };

  return (
    <div className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`group max-w-[78%] p-3 rounded-lg ${
          isOutbound ? 'bg-primary text-primary-foreground' : 'bg-muted text-foreground'
        }`}
        onDoubleClick={() => onReply?.(message)}
      >
        {showQuoted && message.quoted && (
          <div className="mb-2 px-2 py-1 border-l-2 border-current/40 bg-background/20 rounded-sm">
            <p className="text-xs opacity-70">{message.quoted.sender || 'Em resposta a'}</p>
            <p className="text-xs opacity-90 line-clamp-2">{message.quoted.content || '...'}</p>
          </div>
        )}

        {renderBody()}

        <div className="flex items-center justify-between gap-3 mt-2">
          <span className="text-[10px] opacity-70">
            {format(new Date(message.created_at), "dd/MM HH:mm", { locale: ptBR })}
          </span>
          {isOutbound && (
            <span className="flex items-center gap-1">
              {message.status === 'failed' ? (
                <Badge variant="destructive" className="h-4 px-1 text-[10px]">Falhou</Badge>
              ) : (
                <StatusIcon status={message.status} />
              )}
            </span>
          )}
        </div>
      </div>

      {type === 'image' && url && (
        <Dialog open={imageOpen} onOpenChange={setImageOpen}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle className="sr-only">Imagem ampliada</DialogTitle>
            </DialogHeader>
            <img src={url} alt={caption ?? 'Imagem'} className="w-full h-auto" />
            {caption && <p className="text-sm whitespace-pre-wrap mt-2">{caption}</p>}
            <Button asChild variant="outline" size="sm" className="mt-2 w-fit">
              <a href={url} target="_blank" rel="noopener noreferrer" download>
                <Download className="w-4 h-4 mr-2" /> Baixar
              </a>
            </Button>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

export function pickMessagePreview(message: RenderableMessage): string {
  const t = (message.message_type || 'text').toLowerCase();
  if (t === 'image') return '📷 Imagem';
  if (t === 'video') return '📹 Vídeo';
  if (t === 'audio') return '🎤 Áudio';
  if (t === 'document') return '📄 Documento';
  if (t === 'sticker') return '🖼️ Figurinha';
  if (t === 'location') return '📍 Localização';
  if (t === 'contact') return '👤 Contato';
  if (t === 'reaction') return '❤️ Reação';
  if (t === 'deleted') return '🚫 Mensagem apagada';
  return message.content || '';
}

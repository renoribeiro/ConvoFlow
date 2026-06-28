import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Bot,
  Download,
  ExternalLink,
  FileText,
  MapPin,
  Megaphone,
  Mic,
  Trash2,
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { MessageStatusIcon } from './MessageStatusIcon';

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
  /** Identifies the send origin: 'campaign', 'chatbot', or null for manual. */
  source?: string | null;
  /** When source === 'campaign', this links to mass_message_campaigns.id. */
  campaign_id?: string | null;
  /** Resolved campaign name — optionally injected by the parent. */
  campaign_name?: string | null;
  is_from_bot?: boolean | null;
};

/** Characters after which a text message gets a "Ver mais"/"Ver menos" toggle. */
const LONG_MESSAGE_THRESHOLD = 500;

/** Wraps occurrences of `term` (case-insensitive) in <mark> for in-conversation search. */
function highlightText(text: string, term?: string): React.ReactNode {
  if (!term || !term.trim()) return text;
  const needle = term.trim();
  const safe = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = text.split(new RegExp(`(${safe})`, 'gi'));
  return parts.map((part, i) =>
    part.toLowerCase() === needle.toLowerCase() ? (
      <mark key={i} className="bg-primary/30 text-foreground rounded-sm">
        {part}
      </mark>
    ) : (
      part
    ),
  );
}

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
        className="block max-w-[280px] rounded-lg overflow-hidden border border-border/40"
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
      <video controls className="max-w-[280px] rounded-lg overflow-hidden border border-border/40" preload="metadata">
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
      <MapPin className="w-5 h-5 text-accent" />
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

function OriginBadge({ message }: { message: RenderableMessage }) {
  if (message.direction !== 'outbound') return null;

  const source = message.source;

  if (source === 'campaign') {
    const label = message.campaign_name ? `Campanha: ${message.campaign_name}` : 'Campanha';
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded-sm font-medium bg-accent/15 text-accent">
        <Megaphone className="w-3 h-3" />
        {label}
      </span>
    );
  }

  if (source === 'chatbot' || message.is_from_bot) {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded-sm font-medium bg-primary/20 text-primary-foreground">
        <Bot className="w-3 h-3" />
        Chatbot
      </span>
    );
  }

  return null;
}

interface MessageBubbleProps {
  message: RenderableMessage;
  /**
   * Quando definido, mostra o conteúdo da mensagem citada acima da bolha.
   */
  showQuoted?: boolean;
  onReply?: (message: RenderableMessage) => void;
  /** Termo de busca em destaque (in-conversation search). */
  searchTerm?: string;
  /** True quando esta bolha é o resultado de busca ativo. */
  isActiveMatch?: boolean;
}

export function MessageBubble({ message, showQuoted = true, onReply, searchTerm, isActiveMatch }: MessageBubbleProps) {
  const isOutbound = message.direction === 'outbound';
  const meta = useMemo(() => tryParseMetadata(message), [message]);
  const [imageOpen, setImageOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);

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

    // Default: text — with optional "Ver mais" toggle for long messages.
    const text = message.content || '';
    const isLong = text.length > LONG_MESSAGE_THRESHOLD;
    return (
      <div>
        <p className={`text-sm whitespace-pre-wrap break-words ${isLong && !expanded ? 'line-clamp-[12]' : ''}`}>
          {highlightText(text, searchTerm)}
        </p>
        {isLong && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="mt-1 text-xs font-medium text-accent hover:underline"
          >
            {expanded ? 'Ver menos' : 'Ver mais'}
          </button>
        )}
      </div>
    );
  };

  return (
    <div className={`flex ${isOutbound ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`group max-w-[78%] p-3 transition-shadow ${
          isOutbound
            ? 'bg-primary/15 text-foreground rounded-lg rounded-tr-sm'
            : 'bg-muted text-foreground rounded-lg rounded-tl-sm'
        } ${isActiveMatch ? 'ring-2 ring-primary/50' : ''}`}
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
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground/70">
              {format(new Date(message.created_at), 'dd/MM HH:mm', { locale: ptBR })}
            </span>
            <OriginBadge message={message} />
          </div>
          {isOutbound && (
            <span className="flex items-center">
              <MessageStatusIcon status={message.status} />
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
            <img src={url} alt={caption ?? 'Imagem'} className="w-full h-auto rounded-lg" />
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

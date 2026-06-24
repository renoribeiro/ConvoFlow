/**
 * Right sidebar: config panel for the currently selected node.
 * Dispatches to per-node-type sub-panels.
 */
import React from 'react';
import type { Node } from '@xyflow/react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { BLOCK_BY_TYPE } from '@/lib/chatbot/flowConstants';
import type { ChatbotNodeType, ChatbotNodeData } from '@/types/chatbot-flow.types';
import type { ChatbotVariableRow } from '@/types/chatbot-flow.types';
import { FeatureHelp } from '@/components/shared/FeatureHelp';
import SendTextPanel from './SendTextPanel';
import AskQuestionPanel from './AskQuestionPanel';
import ShowOptionsPanel from './ShowOptionsPanel';
import ConditionPanel from './ConditionPanel';
import TransferAgentPanel from './TransferAgentPanel';
import SetVariablePanel from './SetVariablePanel';
import UpdateContactPanel from './UpdateContactPanel';
import MoveFunnelPanel from './MoveFunnelPanel';
import EndFlowPanel from './EndFlowPanel';

interface NodeConfigPanelProps {
  node: Node;
  variables: ChatbotVariableRow[];
  onDataChange: (nodeId: string, data: ChatbotNodeData & Record<string, unknown>) => void;
}

const NodeConfigPanel: React.FC<NodeConfigPanelProps> = ({ node, variables, onDataChange }) => {
  const type = node.type as ChatbotNodeType;
  const block = BLOCK_BY_TYPE[type];
  const data = node.data as ChatbotNodeData & Record<string, unknown>;

  const update = (patch: Partial<ChatbotNodeData & Record<string, unknown>>) => {
    onDataChange(node.id, { ...data, ...patch } as ChatbotNodeData & Record<string, unknown>);
  };

  const renderPanel = () => {
    switch (type) {
      case 'start':
        return <p className="text-sm text-muted-foreground">Nó de início — sem configuração adicional.</p>;
      case 'send_text':
        return <SendTextPanel data={data as any} variables={variables} onChange={update} />;
      case 'ask_question':
        return <AskQuestionPanel data={data as any} variables={variables} onChange={update} />;
      case 'show_options':
        return <ShowOptionsPanel data={data as any} variables={variables} onChange={update} />;
      case 'condition':
        return <ConditionPanel data={data as any} variables={variables} onChange={update} />;
      case 'transfer_agent':
        return <TransferAgentPanel data={data as any} onChange={update} />;
      case 'set_variable':
        return <SetVariablePanel data={data as any} variables={variables} onChange={update} />;
      case 'update_contact':
        return <UpdateContactPanel data={data as any} onChange={update} />;
      case 'move_funnel':
        return <MoveFunnelPanel data={data as any} onChange={update} />;
      case 'end_flow':
        return <EndFlowPanel data={data as any} onChange={update} />;
      default:
        return null;
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Panel header */}
      <div className={`flex items-center gap-2 px-4 py-3 ${block.headerClass}`}>
        <span>{block.emoji}</span>
        <span className="text-sm font-semibold text-white">{block.label}</span>
        <div className="ml-auto text-white">
          <FeatureHelp helpKey={type} className="text-white/80 hover:text-white hover:bg-white/20" />
        </div>
      </div>
      <Separator />
      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {renderPanel()}
        </div>
      </ScrollArea>
    </div>
  );
};

export default NodeConfigPanel;

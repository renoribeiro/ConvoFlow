
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Edit, Trash2 } from 'lucide-react';

export const MessageTemplates = () => {
  const [templates, setTemplates] = useState([
    {
      id: '1',
      name: 'Saudação Inicial',
      content: 'Olá {{nome}}! Bem-vindo à nossa empresa. Como posso ajudá-lo?',
      category: 'greeting',
      variables: ['nome'],
      isActive: true
    },
    {
      id: '2',
      name: 'Transferência para Humano',
      content: 'Vou transferir você para um de nossos atendentes. Aguarde um momento.',
      category: 'transfer',
      variables: [],
      isActive: true
    }
  ]);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Templates de Mensagem</h3>
        <Button onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Novo Template
        </Button>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>Novo Template</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="templateName">Nome</Label>
                <Input id="templateName" placeholder="Nome do template" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="templateCategory">Categoria</Label>
                <Select>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="greeting">Saudação</SelectItem>
                    <SelectItem value="response">Resposta</SelectItem>
                    <SelectItem value="fallback">Fallback</SelectItem>
                    <SelectItem value="transfer">Transferência</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="templateContent">Conteúdo</Label>
              <Textarea 
                id="templateContent"
                placeholder="Digite o conteúdo do template... Use {{variavel}} para variáveis"
                rows={4}
              />
            </div>

            <div className="flex items-center gap-2">
              <Button>Salvar Template</Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {templates.map((template) => (
          <Card key={template.id}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">{template.name}</CardTitle>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{template.category}</Badge>
                  <Badge variant={template.isActive ? 'default' : 'secondary'}>
                    {template.isActive ? 'Ativo' : 'Inativo'}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-gray-50 p-3 rounded-lg">
                <p className="text-sm">{template.content}</p>
              </div>

              {template.variables.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-2">
                    VARIÁVEIS:
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {template.variables.map((variable, idx) => (
                      <Badge key={idx} variant="secondary" className="text-xs">
                        {`{{${variable}}}`}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm">
                  <Edit className="h-4 w-4 mr-2" />
                  Editar
                </Button>
                <Button variant="outline" size="sm">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Excluir
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

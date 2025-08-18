import { z } from 'zod';
import { CommonSchemas, BaseEntitySchema } from './common';

// Contact validation schema
export const ContactSchema = z.object({
  name: CommonSchemas.name,
  phone: CommonSchemas.phone,
  email: CommonSchemas.email,
  current_stage_id: CommonSchemas.uuid,
  lead_source_id: CommonSchemas.uuid,
  status: CommonSchemas.contactStatus.default('active'),
  custom_fields: CommonSchemas.customFields,
  last_interaction: CommonSchemas.dateTime
}).merge(BaseEntitySchema.omit({ id: true, created_at: true, updated_at: true }));

// Contact update schema (all fields optional except tenant_id)
export const ContactUpdateSchema = ContactSchema.partial().required({ tenant_id: true });

// Contact creation schema
export const ContactCreateSchema = ContactSchema.omit({ last_interaction: true });

// Contact filter schema
export const ContactFilterSchema = z.object({
  search: CommonSchemas.searchQuery,
  current_stage_id: CommonSchemas.uuid.optional(),
  lead_source_id: CommonSchemas.uuid.optional(),
  status: CommonSchemas.contactStatus.optional(),
  tags: CommonSchemas.tags,
  created_after: CommonSchemas.dateTime,
  created_before: CommonSchemas.dateTime,
  last_interaction_after: CommonSchemas.dateTime,
  last_interaction_before: CommonSchemas.dateTime,
  pagination: CommonSchemas.pagination
});

// Contact import schema
export const ContactImportSchema = z.object({
  contacts: z.array(ContactCreateSchema).min(1, 'Pelo menos um contato é obrigatório').max(1000, 'Máximo 1000 contatos por importação'),
  tenant_id: CommonSchemas.uuid,
  default_current_stage_id: CommonSchemas.uuid,
  default_lead_source_id: CommonSchemas.uuid,
  skip_duplicates: z.boolean().default(true)
});

// Contact bulk update schema
export const ContactBulkUpdateSchema = z.object({
  contact_ids: z.array(CommonSchemas.uuid).min(1, 'Pelo menos um contato deve ser selecionado').max(100, 'Máximo 100 contatos por operação'),
  updates: z.object({
    current_stage_id: CommonSchemas.uuid.optional(),
    lead_source_id: CommonSchemas.uuid.optional(),
    status: CommonSchemas.contactStatus.optional(),
    tags: z.object({
      add: CommonSchemas.tags,
      remove: CommonSchemas.tags
    }).optional()
  }),
  tenant_id: CommonSchemas.uuid
});

// Contact export schema
export const ContactExportSchema = z.object({
  filters: ContactFilterSchema.omit({ pagination: true }).optional(),
  format: z.enum(['csv', 'xlsx', 'json'], {
    errorMap: () => ({ message: 'Formato de exportação inválido' })
  }),
  fields: z.array(z.string()).optional(),
  tenant_id: CommonSchemas.uuid
});

// Type exports
export type ContactFormData = z.infer<typeof ContactSchema>;
export type ContactCreateData = z.infer<typeof ContactCreateSchema>;
export type ContactUpdateData = z.infer<typeof ContactUpdateSchema>;
export type ContactFilterData = z.infer<typeof ContactFilterSchema>;
export type ContactImportData = z.infer<typeof ContactImportSchema>;
export type ContactBulkUpdateData = z.infer<typeof ContactBulkUpdateSchema>;
export type ContactExportData = z.infer<typeof ContactExportSchema>;

// Validation functions
export const validateContact = (data: unknown) => {
  return ContactSchema.safeParse(data);
};

export const validateContactCreate = (data: unknown) => {
  return ContactCreateSchema.safeParse(data);
};

export const validateContactUpdate = (data: unknown) => {
  return ContactUpdateSchema.safeParse(data);
};

export const validateContactFilter = (data: unknown) => {
  return ContactFilterSchema.safeParse(data);
};

export const validateContactImport = (data: unknown) => {
  return ContactImportSchema.safeParse(data);
};

export const validateContactBulkUpdate = (data: unknown) => {
  return ContactBulkUpdateSchema.safeParse(data);
};

export const validateContactExport = (data: unknown) => {
  return ContactExportSchema.safeParse(data);
};
/**
 * Provider factory for WhatsApp integrations.
 *
 * Resolves `instance.provider` (defaulting to 'evolution') and pulls
 * credentials from `connection_config` (new) OR legacy
 * `evolution_api_url` / `evolution_api_key` columns.
 *
 * Supported providers:
 *   'evolution'  → EvolutionProvider  (Evolution API v2)
 *   'waha'       → WahaProvider       (WAHA self-hosted)
 *   'official'   → MetaProvider       (Meta Cloud API)
 *
 * SKILL references consulted:
 *   Evolution v2 : .agent/skills/evolution-v2/SKILL.md §2, §3
 *   WAHA         : .agent/skills/waha/SKILL.md §2, §3
 *   Meta         : .agent/skills/meta-cloud-api/SKILL.md §2
 */

import { IWhatsAppProvider, ProviderConfig } from './base.ts';
import { EvolutionProvider } from './evolution.ts';
import { WahaProvider } from './waha.ts';
import { MetaProvider, MetaProviderConfig } from './meta.ts';

export interface WhatsAppInstanceRecord {
  id: string;
  tenant_id: string;
  instance_key: string;
  provider?: string | null;
  /** New-style credential bag (supersedes legacy columns). */
  connection_config?: Record<string, unknown> | null;
  /** Legacy Evolution columns — preserved for backward compatibility. */
  evolution_api_url?: string | null;
  evolution_api_key?: string | null;
}

export class ProviderFactory {
  static getProvider(instance: WhatsAppInstanceRecord): IWhatsAppProvider {
    const provider = instance.provider ?? 'evolution';
    const cfg = instance.connection_config ?? {};

    switch (provider) {
      case 'waha': {
        // WAHA: credentials in connection_config.baseUrl / connection_config.apiKey
        const config: ProviderConfig = {
          baseUrl: (cfg.baseUrl as string | undefined) ?? '',
          apiKey: (cfg.apiKey as string | undefined) ?? '',
          instanceName:
            (cfg.sessionName as string | undefined) ??
            (cfg.instanceName as string | undefined) ??
            instance.instance_key,
        };
        return new WahaProvider(config);
      }

      case 'official': {
        // Meta Cloud API: phoneNumberId + accessToken from connection_config.
        // accessToken may come from Vault (resolved by caller before reaching here)
        // or directly from connection_config in lower-security deployments.
        const metaCfg: MetaProviderConfig = {
          baseUrl: 'https://graph.facebook.com',
          apiKey: (cfg.accessToken as string | undefined) ?? '',
          instanceName: instance.instance_key,
          phoneNumberId: (cfg.phoneNumberId as string | undefined) ?? '',
          wabaId: (cfg.wabaId as string | undefined),
          accessToken: (cfg.accessToken as string | undefined) ?? '',
          graphApiVersion: (cfg.graphApiVersion as string | undefined) ?? 'v19.0',
        };
        return new MetaProvider(metaCfg);
      }

      case 'evolution':
      default: {
        // Evolution API v2: prefer connection_config, fall back to legacy columns.
        const baseUrl =
          (cfg.baseUrl as string | undefined) ??
          instance.evolution_api_url ??
          '';
        const apiKey =
          (cfg.apiKey as string | undefined) ??
          instance.evolution_api_key ??
          '';
        const instanceName =
          (cfg.instanceName as string | undefined) ?? instance.instance_key;

        const config: ProviderConfig = { baseUrl, apiKey, instanceName };
        return new EvolutionProvider(config);
      }
    }
  }
}

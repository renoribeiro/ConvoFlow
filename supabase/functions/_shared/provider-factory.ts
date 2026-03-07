import { IWhatsAppProvider, ProviderConfig } from './whatsapp-providers/base.ts';
import { EvolutionProvider } from './whatsapp-providers/evolution.ts';
import { WahaProvider } from './whatsapp-providers/waha.ts';

interface InstanceData {
    provider?: string;
    instance_key: string;
    connection_config?: Record<string, any>;
    // Legacy support
    evolution_api_url?: string;
    evolution_api_key?: string;
}

export class ProviderFactory {
    static getProvider(instance: InstanceData): IWhatsAppProvider {
        const providerType = instance.provider || 'evolution';
        
        // Normalize config
        let config: ProviderConfig = {
            baseUrl: '',
            apiKey: '',
            instanceName: instance.instance_key
        };

        if (providerType === 'evolution') {
            // Support both new connection_config and legacy columns
            config.baseUrl = instance.connection_config?.baseUrl || instance.evolution_api_url || '';
            config.apiKey = instance.connection_config?.apiKey || instance.evolution_api_key || '';
            
            if (!config.baseUrl || !config.apiKey) {
                throw new Error(`Missing configuration for Evolution provider (instance: ${instance.instance_key})`);
            }
            
            return new EvolutionProvider(config);
        }
        
        if (providerType === 'waha') {
            config.baseUrl = instance.connection_config?.baseUrl || '';
            config.apiKey = instance.connection_config?.apiKey || '';
            
            if (!config.baseUrl || !config.apiKey) {
                 throw new Error(`Missing configuration for Waha provider (instance: ${instance.instance_key})`);
            }
            
            return new WahaProvider(config);
        }

        throw new Error(`Unsupported provider type: ${providerType}`);
    }
}

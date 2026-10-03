import { tabUrl } from '../model.js';
import { github } from './github.js';

// Built-in providers own URL matching, page parsing and state vocabulary.
// The cache, permissions, refresh queue and UI use this shared contract.
export const providers = [github];

export function pageTarget(tab) {
  for (const provider of providers) {
    const target = provider.match(tabUrl(tab));
    if (target) {
      return { ...target, provider, key: `${provider.id}:${target.url}` };
    }
  }
  return null;
}

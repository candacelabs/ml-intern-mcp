import providerHeaders from '../generated/byos/credential-headers.json' with { type: 'json' };

export { providerHeaders };

export const allProviderHeaders = Object.assign({}, ...Object.values(providerHeaders));

export function providerCredentials(provider, supplied) {
  const env = {};
  for (const [key, header] of Object.entries(providerHeaders[provider])) {
    if (!supplied[key]) throw new Error(`Missing ${provider} credential. Supply ${key} over stdio or ${header} over HTTP.`);
    env[key] = supplied[key];
  }
  return env;
}

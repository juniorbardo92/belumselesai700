import {
  getTopicResearchConnector,
  TopicResearchConnectorError,
  type TopicResearchCollection,
  type TopicResearchConnectorInput
} from './topic-research-connectors';

type ConnectorEnv = Env;
type Collect = (input: TopicResearchConnectorInput, env: ConnectorEnv) => Promise<TopicResearchCollection>;

type WrappedCollect = Collect & { __umkmReplizTimeoutFallback?: true };

function timeoutError(error: unknown): error is TopicResearchConnectorError {
  return error instanceof TopicResearchConnectorError && error.status === 504;
}

export async function collectWithReplizTimeoutFallback(
  collect: Collect,
  input: TopicResearchConnectorInput,
  env: ConnectorEnv
): Promise<TopicResearchCollection> {
  try {
    return await collect(input, env);
  } catch (error) {
    if (!timeoutError(error)) throw error;

    const primaryKeyword = input.keywords.map((keyword) => keyword.trim()).find(Boolean);
    if (!primaryKeyword || input.keywords.length <= 1) throw error;

    const fallbackResult = await collect(
      {
        ...input,
        keywords: [primaryKeyword]
      },
      env
    );

    return {
      ...fallbackResult,
      warnings: [
        ...fallbackResult.warnings,
        'Sebagian pencarian Repliz melewati batas waktu. Riset diselesaikan dengan satu keyword utama secara read-only.'
      ]
    };
  }
}

function installReplizTimeoutFallback(): void {
  const connector = getTopicResearchConnector('repliz_threads');
  if (!connector) return;

  const current = connector.collect as WrappedCollect;
  if (current.__umkmReplizTimeoutFallback) return;

  const original = current.bind(connector) as Collect;
  const wrapped: WrappedCollect = (input, env) => collectWithReplizTimeoutFallback(original, input, env);
  Object.defineProperty(wrapped, '__umkmReplizTimeoutFallback', {
    value: true,
    enumerable: false,
    configurable: false,
    writable: false
  });
  connector.collect = wrapped;
}

installReplizTimeoutFallback();

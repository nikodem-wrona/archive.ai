import { FastifyInstance } from 'fastify';
import { ChatOpenAI, OpenAIEmbeddings } from '@langchain/openai';
import {
  PGVectorStore,
  PGVectorStoreArgs,
} from '@langchain/community/vectorstores/pgvector';
import { TextLoader } from 'langchain/document_loaders/fs/text';
import { CSVLoader } from '@langchain/community/document_loaders/fs/csv';

import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { pull } from 'langchain/hub';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { Annotation, StateGraph } from '@langchain/langgraph';

const llm = new ChatOpenAI({
  model: 'gpt-4o-mini',
  temperature: 0,
});

const embeddings = new OpenAIEmbeddings({
  model: 'text-embedding-3-large',
});

const handleStore = async (pgVectorConfig: PGVectorStoreArgs) => {
  const loader = new CSVLoader('data/books.csv');
  const docs = await loader.load();

  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 200,
  });

  const splits = await splitter.splitDocuments(docs);

  const vectorStore = await PGVectorStore.initialize(
    embeddings,
    pgVectorConfig,
  );

  await vectorStore.addDocuments(splits);

  return { success: true };
};

const handleRetrieve = async (pgVectorConfig: PGVectorStoreArgs) => {
  const promptTemplate = await pull<ChatPromptTemplate>('rlm/rag-prompt');

  const InputStateAnnotation = Annotation.Root({
    question: Annotation<string>,
  });

  const StateAnnotation = Annotation.Root({
    question: Annotation<string>,
    context: Annotation<Document[]>,
    answer: Annotation<string>,
  });

  const vectorStore = await PGVectorStore.initialize(
    embeddings,
    pgVectorConfig,
  );

  const retrieve = async (state: typeof InputStateAnnotation.State) => {
    const retrievedDocs = await vectorStore.similaritySearch(state.question);
    return { context: retrievedDocs };
  };

  const generate = async (state: typeof StateAnnotation.State) => {
    const docsContent = state.context
      .map((doc) => (doc as any).pageContent)
      .join('\n');

    console.log(docsContent);

    const messages = await promptTemplate.invoke({
      question: state.question,
      context: docsContent,
    });
    const response = await llm.invoke(messages);
    return { answer: response.content };
  };

  const graph = new StateGraph(StateAnnotation)
    .addNode('retrieve', retrieve)
    .addNode('generate', generate)
    .addEdge('__start__', 'retrieve')
    .addEdge('retrieve', 'generate')
    .addEdge('generate', '__end__')
    .compile();

  let inputs = { question: 'What books I have read?' };

  const result = await graph.invoke(inputs);
  console.log(result.answer);

  return { answer: result.answer };
};

export default async function (server: FastifyInstance) {
  server.route({
    method: 'GET',
    url: '/store',
    handler: () => handleStore(server.pgVectorConfig),
  });

  server.route({
    method: 'GET',
    url: '/retrieve',
    handler: () => handleRetrieve(server.pgVectorConfig),
  });
}

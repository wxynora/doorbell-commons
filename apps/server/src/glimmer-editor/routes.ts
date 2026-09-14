import { modelVisibleLingyeOperations } from '../doorbell-lingye-op-registry.js';
import { farmOperations } from '../doorbell-farm-op-registry.js';
import type { FastifyInstance } from 'fastify';
import type { RegistrationAuthService } from '../registration-auth.js';
import { readHumanSessionToken } from '../session-cookie.js';
type Options = { auth: RegistrationAuthService; ownerAccountId: string; farm: { apiBaseUrl: string; serviceToken: string; requestTimeoutMs: number } };
export function registerGlimmerEditorRoutes(app: FastifyInstance, options: Options) {
  app.route({ method: ['GET', 'POST'], url: '/api/glimmer-editor', handler: async (request, reply) => {
    reply.header('cache-control', 'no-store');
    if (!options.ownerAccountId) return reply.code(503).send({ error: { message: '工作台尚未开放。' } });
    const token = readHumanSessionToken(request.headers.cookie);
    if (!token) return reply.code(401).send({ error: { message: '请先登录社区，再打开工作台。' } });
    let community;
    try { community = await options.auth.getCurrentSession(token); }
    catch { return reply.code(403).send({ error: { message: '登录或社区资格已失效，请重新登录。' } }); }
    if (community.account.accountId !== options.ownerAccountId) return reply.code(403).send({ error: { message: '此工作台仅本人可用。' } });
    if (request.method === 'POST') {
      let originHost = '';
      try { originHost = new URL(request.headers.origin ?? '').host; } catch {}
      if (originHost !== request.headers.host) return reply.code(403).send({ error: { message: '请从社区工作台提交内容。' } });
      const body = request.body as Record<string, unknown> | null;
      if (!body || !['save', 'publish', 'review', 'withdraw', 'import'].includes(String(body.action))) return reply.code(400).send({ error: { message: '操作不正确。' } });
    }
    const tools = [...farmOperations,...modelVisibleLingyeOperations].filter(operation => operation.op !== 'farm.help').map(operation => ({id: operation.op, name: operation.description}));
    const mutation = request.body as {action?:string;content?:{category?:string;tools?:unknown}} | undefined;
    if (request.method === 'POST' && ['save','import'].includes(mutation?.action??'') && mutation?.content?.category === 'npc' && mutation.content.tools !== undefined && (!Array.isArray(mutation.content.tools) || mutation.content.tools.some(op => !tools.some(tool => tool.id === op)))) return reply.code(400).send({error:{message:'请选择列表中的触发工具。'}});
    try {
      const response = await fetch(new URL('/internal/doorbell/glimmer-editor', options.farm.apiBaseUrl), {
        method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${options.farm.serviceToken}` },
        body: JSON.stringify(request.method === 'GET' ? { action: 'list' } : request.body), signal: AbortSignal.timeout(options.farm.requestTimeoutMs),
      });
      const body = await response.json();
      return reply.code(response.status).send(request.method === 'GET' && response.ok ? {...body,catalog:{...body.catalog,tools}} : body);
    } catch { return reply.code(503).send({ error: { message: '暂时连接不上工作台，请重试；已保存内容不会丢失。' } }); }
  } });
}

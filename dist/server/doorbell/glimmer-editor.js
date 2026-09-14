import { glimmerContentEditor } from '../../content.js';
import { MAX_BODY_BYTES } from '../../config.js';
import { readJsonBody, jsonOut } from '../http.js';
import { requireDoorbellHumanFieldService, humanFieldError } from './contract.js';
import { ContentEditorError, validateContent, validateBatch } from '../../domain/glimmer/content-editor.js';
export async function handleGlimmerEditor(req, res, method) {
  if (!requireDoorbellHumanFieldService(req, res, method)) return;
  try {
    const body = await readJsonBody(req, MAX_BODY_BYTES);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ContentEditorError(400, '请求格式不正确。');
    const { action, ...input } = body;
    if (action === 'list' && Object.keys(input).length === 0) return jsonOut(res, 200, glimmerContentEditor.list());
    if (action === 'save') return jsonOut(res, 200, glimmerContentEditor.save(input));
    if (action === 'import') return jsonOut(res, 200, Array.isArray(input.content) ? validateBatch(input.content, glimmerContentEditor.catalog) : validateContent(input.content, glimmerContentEditor.catalog, true));
    if (action === 'save_batch') return jsonOut(res, 200, glimmerContentEditor.saveBatch(input));
    if (action === 'review') return jsonOut(res, 200, glimmerContentEditor.review(input));
    if (action === 'withdraw') return jsonOut(res, 200, glimmerContentEditor.withdraw(input));
    if (action === 'publish') return jsonOut(res, 200, glimmerContentEditor.publish(input));
    throw new ContentEditorError(400, '操作不存在。');
  } catch (error) {
    const status = error instanceof ContentEditorError ? error.status : error.name === 'PublicSyncError' ? 400 : 503;
    return humanFieldError(res, status, 'content_editor_error', status === 503 ? '内容工作台暂时不可用，已保存内容会保留。' : error.message);
  }
}

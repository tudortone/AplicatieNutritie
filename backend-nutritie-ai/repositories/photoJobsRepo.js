'use strict';

const JOB_FIELDS = 'id,user_id,logical_analysis_id,trigger_run_id,status,result,error_code,' +
  'image_url,image_file_id,credit_reservation_id,queue_name,created_at,updated_at,started_at,completed_at';

function normalize(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    logicalAnalysisId: row.logical_analysis_id,
    triggerRunId: row.trigger_run_id,
    status: row.status,
    result: row.result,
    errorCode: row.error_code,
    imageUrl: row.image_url,
    imageFileId: row.image_file_id,
    creditReservationId: row.credit_reservation_id,
    queueName: row.queue_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
  };
}

function requireContext(ctx) {
  if (!ctx?.db) throw new TypeError('RLS data context is required for Photo job reads.');
  return ctx.db;
}

function createPhotoJobsRepo({ supabaseAdmin } = {}) {
  if (!supabaseAdmin?.from) throw new TypeError('Supabase admin client is required for Photo job writes.');
  return Object.freeze({
    async findByLogicalId({ ctx, userId, logicalAnalysisId }) {
      const { data, error } = await requireContext(ctx).from('ai_jobs').select(JOB_FIELDS)
        .eq('user_id', userId).eq('logical_analysis_id', logicalAnalysisId).maybeSingle();
      if (error) throw error;
      return normalize(data);
    },
    async create(input) {
      const { data, error } = await supabaseAdmin.from('ai_jobs').insert({
        user_id: input.userId,
        logical_analysis_id: input.logicalAnalysisId,
        image_url: input.imageUrl,
        image_file_id: input.imageFileId,
        credit_reservation_id: input.creditReservationId,
        queue_name: input.queueName,
        status: 'queued',
      }).select(JOB_FIELDS).single();
      if (error) throw error;
      return normalize(data);
    },
    async attachTriggerRun({ jobId, triggerRunId }) {
      const { error } = await supabaseAdmin.from('ai_jobs')
        .update({ trigger_run_id: triggerRunId }).eq('id', jobId);
      if (error) throw error;
    },
    async markFailed({ jobId, errorCode }) {
      const { error } = await supabaseAdmin.from('ai_jobs').update({
        status: 'failed', error_code: errorCode, completed_at: new Date().toISOString(),
      }).eq('id', jobId).not('status', 'in', '(succeeded,completed)');
      if (error) throw error;
    },
    async getOwned({ ctx, userId, jobId }) {
      const { data, error } = await requireContext(ctx).from('ai_jobs').select(JOB_FIELDS)
        .eq('id', jobId).eq('user_id', userId).maybeSingle();
      if (error) throw error;
      return normalize(data);
    },
    async getActiveOwned({ ctx, userId }) {
      const { data, error } = await requireContext(ctx).from('ai_jobs').select(JOB_FIELDS)
        .eq('user_id', userId).in('status', ['queued', 'running', 'processing'])
        .order('created_at', { ascending: false }).limit(1).maybeSingle();
      if (error) throw error;
      return normalize(data);
    },
  });
}

module.exports = { createPhotoJobsRepo, JOB_FIELDS };

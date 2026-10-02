'use strict';

class GoogleBillingRepositoryError extends Error {
  constructor(operation) {
    super(`Google Play billing persistence failed during ${operation}.`);
    this.name = 'GoogleBillingRepositoryError';
    this.code = 'GOOGLE_BILLING_PERSISTENCE_FAILED';
    this.status = 503;
  }
}

function assertResult(result, operation) {
  if (result?.error) throw new GoogleBillingRepositoryError(operation);
  return result?.data ?? null;
}

function createGoogleBillingRepo({ supabaseAdmin } = {}) {
  if (!supabaseAdmin || typeof supabaseAdmin.rpc !== 'function') {
    throw new TypeError('supabaseAdmin is required for Google billing persistence.');
  }

  return Object.freeze({
    async applyVerification(record) {
      const result = await supabaseAdmin.rpc('apply_google_play_subscription_verification', {
        p_user_id: record.userId,
        p_purchase_token: record.purchaseToken,
        p_purchase_token_hash: record.purchaseTokenHash,
        p_product_id: record.productId,
        p_base_plan_id: record.basePlanId,
        p_offer_id: record.offerId,
        p_subscription_state: record.subscriptionState,
        p_expiry_time: record.expiryTime,
        p_acknowledgement_state: record.acknowledgementState,
        p_linked_purchase_token: record.linkedPurchaseToken,
        p_is_entitled: record.isEntitled,
        p_is_test_purchase: record.isTestPurchase,
        p_verification_started_at: record.verificationStartedAt,
      });
      return assertResult(result, 'verification');
    },

    async getPaidEntitlement(userId, nowIso) {
      const result = await supabaseAdmin
        .from('google_play_subscriptions')
        .select([
          'purchase_token_hash',
          'product_id',
          'base_plan_id',
          'offer_id',
          'subscription_state',
          'expiry_time',
          'acknowledgement_state',
          'is_entitled',
          'is_test_purchase',
        ].join(','))
        .eq('user_id', userId)
        .eq('is_entitled', true)
        .gt('expiry_time', nowIso)
        .order('expiry_time', { ascending: false })
        .limit(1)
        .maybeSingle();
      return assertResult(result, 'entitlement_read');
    },

    async findOwnerByToken(purchaseToken) {
      const result = await supabaseAdmin
        .from('google_play_subscriptions')
        .select('user_id')
        .eq('purchase_token', purchaseToken)
        .maybeSingle();
      return assertResult(result, 'token_owner_read')?.user_id ?? null;
    },

    async claimAcknowledgements(limit = 10) {
      const result = await supabaseAdmin.rpc('claim_google_play_acknowledgements', {
        p_limit: limit,
        p_lease_seconds: 60,
      });
      const rows = assertResult(result, 'acknowledgement_claim') ?? [];
      return rows.map((row) => ({
        purchaseToken: row.purchase_token,
        productId: row.product_id,
      }));
    },

    async applyAcknowledgementResult({ purchaseToken, succeeded, errorCode = null, nextRetryAt = null }) {
      const result = await supabaseAdmin.rpc('apply_google_play_acknowledgement_result', {
        p_purchase_token: purchaseToken,
        p_succeeded: succeeded,
        p_error_code: errorCode,
        p_next_retry_at: nextRetryAt,
      });
      return assertResult(result, 'acknowledgement_result');
    },

    async claimRtdnEvent(event) {
      const result = await supabaseAdmin.rpc('claim_google_play_rtdn_event', {
        p_message_id: event.messageId,
        p_publish_time: event.publishTime,
        p_event_time: event.eventTime,
        p_package_name: event.packageName,
        p_notification_type: event.notificationType,
        p_purchase_token_hash: event.purchaseTokenHash,
      });
      return assertResult(result, 'rtdn_claim') === true;
    },

    async completeRtdnEvent({ messageId, processingStatus, errorCode = null }) {
      const result = await supabaseAdmin.rpc('complete_google_play_rtdn_event', {
        p_message_id: messageId,
        p_processing_status: processingStatus,
        p_error_code: errorCode,
      });
      return assertResult(result, 'rtdn_complete') === true;
    },
  });
}

module.exports = {
  GoogleBillingRepositoryError,
  createGoogleBillingRepo,
};

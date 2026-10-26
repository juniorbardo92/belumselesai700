export type MonetizationQualityEnv={DB:D1Database};

export async function monetizationQualityEnabled(env:MonetizationQualityEnv):Promise<boolean>{
  return Boolean(await env.DB.prepare(`SELECT name FROM sqlite_master
    WHERE type='table' AND name='monetization_record_quality'`).first());
}

export function verifiedQualityFilter(enabled:boolean,recordType:'event'|'revenue_event'|'learning_insight',alias:string):string{
  if(!enabled)return '';
  const lifecycleScope=recordType==='revenue_event'?`AND (${alias}.transaction_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM monetization_revenue_events lifecycle_member
    WHERE lifecycle_member.brand_id=${alias}.brand_id AND lifecycle_member.source=${alias}.source
      AND lifecycle_member.transaction_id=${alias}.transaction_id
      AND NOT EXISTS (SELECT 1 FROM monetization_record_quality lifecycle_quality
        WHERE lifecycle_quality.record_type='revenue_event' AND lifecycle_quality.record_id=lifecycle_member.id
          AND lifecycle_quality.data_class='production' AND lifecycle_quality.verification_status='verified'
          AND NULLIF(TRIM(lifecycle_quality.evidence_ref),'') IS NOT NULL
          AND NULLIF(TRIM(lifecycle_quality.reason),'') IS NOT NULL)
  )) AND NOT EXISTS (
    SELECT 1 FROM monetization_attributions attribution_scope
    WHERE attribution_scope.brand_id=${alias}.brand_id AND attribution_scope.revenue_event_id=${alias}.id
      AND ((attribution_scope.first_event_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM monetization_record_quality first_quality
        WHERE first_quality.record_type='event' AND first_quality.record_id=attribution_scope.first_event_id
          AND first_quality.data_class='production' AND first_quality.verification_status='verified'
          AND NULLIF(TRIM(first_quality.evidence_ref),'') IS NOT NULL AND NULLIF(TRIM(first_quality.reason),'') IS NOT NULL
      )) OR (attribution_scope.last_event_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM monetization_record_quality last_quality
        WHERE last_quality.record_type='event' AND last_quality.record_id=attribution_scope.last_event_id
          AND last_quality.data_class='production' AND last_quality.verification_status='verified'
          AND NULLIF(TRIM(last_quality.evidence_ref),'') IS NOT NULL AND NULLIF(TRIM(last_quality.reason),'') IS NOT NULL
      )))
  )`:'';
  return `AND EXISTS (SELECT 1 FROM monetization_record_quality quality_scope
    WHERE quality_scope.record_type='${recordType}' AND quality_scope.record_id=${alias}.id
      AND quality_scope.data_class='production' AND quality_scope.verification_status='verified'
      AND NULLIF(TRIM(quality_scope.evidence_ref),'') IS NOT NULL AND NULLIF(TRIM(quality_scope.reason),'') IS NOT NULL) ${lifecycleScope}`;
}

export function unknownQualityStatement(env:MonetizationQualityEnv,recordType:'event'|'revenue_event'|'learning_insight',recordId:string,reason:string):D1PreparedStatement{
  const sourceTable=recordType==='event'?'monetization_events':recordType==='revenue_event'?'monetization_revenue_events':'monetization_learning_insights';
  return env.DB.prepare(`INSERT INTO monetization_record_quality
    (record_type,record_id,data_class,verification_status,amount_basis,fee_status,cost_status,reason,metadata_json)
    SELECT ?1,?2,'unknown','unverified',?3,?4,?5,?6,?7
    WHERE EXISTS (SELECT 1 FROM ${sourceTable} WHERE id=?2)
    ON CONFLICT(record_type,record_id) DO UPDATE SET
      data_class='unknown',verification_status='unverified',amount_basis=excluded.amount_basis,
      fee_status=excluded.fee_status,cost_status=excluded.cost_status,evidence_ref=NULL,
      reason=excluded.reason,metadata_json=excluded.metadata_json,updated_at=CURRENT_TIMESTAMP`).bind(
      recordType,recordId,recordType==='revenue_event'?'unknown':null,
      recordType==='revenue_event'?'unknown':null,recordType==='revenue_event'?'unknown':null,
      reason,JSON.stringify({classificationRequired:true,createdAutomatically:true})
    );
}

export function invalidateQualityStatement(env:MonetizationQualityEnv,recordType:'event'|'revenue_event'|'learning_insight',recordId:string,reason:string):D1PreparedStatement{
  return env.DB.prepare(`INSERT INTO monetization_record_quality
    (record_type,record_id,data_class,verification_status,amount_basis,fee_status,cost_status,evidence_ref,reason,metadata_json)
    VALUES (?1,?2,'unknown','unverified',?3,?4,?5,NULL,?6,?7)
    ON CONFLICT(record_type,record_id) DO UPDATE SET
      data_class='unknown',verification_status='unverified',amount_basis=excluded.amount_basis,
      fee_status=excluded.fee_status,cost_status=excluded.cost_status,evidence_ref=NULL,
      reason=excluded.reason,metadata_json=excluded.metadata_json,updated_at=CURRENT_TIMESTAMP`).bind(
      recordType,recordId,recordType==='revenue_event'?'unknown':null,
      recordType==='revenue_event'?'unknown':null,recordType==='revenue_event'?'unknown':null,
      reason,JSON.stringify({classificationRequired:true,invalidatedAutomatically:true})
    );
}

export function invalidationHistoryStatement(env:MonetizationQualityEnv,recordType:'event'|'revenue_event'|'learning_insight',recordId:string,reason:string,correlationId:string):D1PreparedStatement{
  return env.DB.prepare(`INSERT INTO monetization_record_quality_history
    (id,record_type,record_id,previous_data_class,previous_verification_status,previous_evidence_ref,previous_reason,previous_metadata_json,
     new_data_class,new_verification_status,evidence_ref,reason,new_metadata_json,actor_type,correlation_id,metadata_json)
    SELECT ?1,?2,?3,q.data_class,q.verification_status,q.evidence_ref,q.reason,q.metadata_json,
      'unknown','unverified',NULL,?4,?6,'system_lifecycle',?5,?6
    FROM monetization_record_quality q WHERE q.record_type=?2 AND q.record_id=?3`).bind(
      `qhist-${crypto.randomUUID()}`,recordType,recordId,reason,correlationId,
      JSON.stringify({source:'automatic_invalidation',identityPersisted:false})
    );
}

export function mutationGuardedInvalidationStatement(env:MonetizationQualityEnv,recordType:'event'|'revenue_event'|'learning_insight',recordId:string,reason:string,guardRevenueId:string,mutationId:string):D1PreparedStatement{
  return env.DB.prepare(`INSERT INTO monetization_record_quality
    (record_type,record_id,data_class,verification_status,amount_basis,fee_status,cost_status,evidence_ref,reason,metadata_json)
    SELECT ?1,?2,'unknown','unverified',?3,?4,?5,NULL,?6,?7
    WHERE EXISTS (SELECT 1 FROM monetization_revenue_events
      WHERE id=?8 AND json_extract(metadata_json,'$.lifecycleMutationId')=?9)
    ON CONFLICT(record_type,record_id) DO UPDATE SET
      data_class='unknown',verification_status='unverified',amount_basis=excluded.amount_basis,
      fee_status=excluded.fee_status,cost_status=excluded.cost_status,evidence_ref=NULL,
      reason=excluded.reason,metadata_json=excluded.metadata_json,updated_at=CURRENT_TIMESTAMP`).bind(
      recordType,recordId,recordType==='revenue_event'?'unknown':null,
      recordType==='revenue_event'?'unknown':null,recordType==='revenue_event'?'unknown':null,
      reason,JSON.stringify({classificationRequired:true,invalidatedAutomatically:true}),guardRevenueId,mutationId
    );
}

export function mutationGuardedInvalidationHistoryStatement(env:MonetizationQualityEnv,recordType:'event'|'revenue_event'|'learning_insight',recordId:string,reason:string,correlationId:string,guardRevenueId:string,mutationId:string):D1PreparedStatement{
  return env.DB.prepare(`INSERT INTO monetization_record_quality_history
    (id,record_type,record_id,previous_data_class,previous_verification_status,previous_evidence_ref,previous_reason,previous_metadata_json,
     new_data_class,new_verification_status,evidence_ref,reason,new_metadata_json,actor_type,correlation_id,metadata_json)
    SELECT ?1,?2,?3,q.data_class,q.verification_status,q.evidence_ref,q.reason,q.metadata_json,
      'unknown','unverified',NULL,?4,?6,'system_lifecycle',?5,?6
    FROM monetization_record_quality q
    WHERE q.record_type=?2 AND q.record_id=?3 AND EXISTS (SELECT 1 FROM monetization_revenue_events
      WHERE id=?7 AND json_extract(metadata_json,'$.lifecycleMutationId')=?8)`).bind(
      `qhist-${crypto.randomUUID()}`,recordType,recordId,reason,correlationId,
      JSON.stringify({source:'automatic_invalidation',identityPersisted:false}),guardRevenueId,mutationId
    );
}

export function guardedInvalidationStatement(env:MonetizationQualityEnv,recordType:'event'|'revenue_event'|'learning_insight',recordId:string,reason:string,guardRevenueId:string):D1PreparedStatement{
  return env.DB.prepare(`INSERT INTO monetization_record_quality
    (record_type,record_id,data_class,verification_status,amount_basis,fee_status,cost_status,evidence_ref,reason,metadata_json)
    SELECT ?1,?2,'unknown','unverified',?3,?4,?5,NULL,?6,?7
    WHERE EXISTS (SELECT 1 FROM monetization_revenue_events WHERE id=?8)
    ON CONFLICT(record_type,record_id) DO UPDATE SET
      data_class='unknown',verification_status='unverified',amount_basis=excluded.amount_basis,
      fee_status=excluded.fee_status,cost_status=excluded.cost_status,evidence_ref=NULL,
      reason=excluded.reason,metadata_json=excluded.metadata_json,updated_at=CURRENT_TIMESTAMP`).bind(
      recordType,recordId,recordType==='revenue_event'?'unknown':null,
      recordType==='revenue_event'?'unknown':null,recordType==='revenue_event'?'unknown':null,
      reason,JSON.stringify({classificationRequired:true,invalidatedAutomatically:true}),guardRevenueId
    );
}

export function guardedInvalidationHistoryStatement(env:MonetizationQualityEnv,recordType:'event'|'revenue_event'|'learning_insight',recordId:string,reason:string,correlationId:string,guardRevenueId:string):D1PreparedStatement{
  return env.DB.prepare(`INSERT INTO monetization_record_quality_history
    (id,record_type,record_id,previous_data_class,previous_verification_status,previous_evidence_ref,previous_reason,previous_metadata_json,
     new_data_class,new_verification_status,evidence_ref,reason,new_metadata_json,actor_type,correlation_id,metadata_json)
    SELECT ?1,?2,?3,q.data_class,q.verification_status,q.evidence_ref,q.reason,q.metadata_json,
      'unknown','unverified',NULL,?4,?6,'system_lifecycle',?5,?6
    FROM monetization_record_quality q
    WHERE q.record_type=?2 AND q.record_id=?3 AND EXISTS (SELECT 1 FROM monetization_revenue_events WHERE id=?7)`).bind(
      `qhist-${crypto.randomUUID()}`,recordType,recordId,reason,correlationId,
      JSON.stringify({source:'automatic_invalidation',identityPersisted:false}),guardRevenueId
    );
}

type Env={
  DB:D1Database;
  CONTENT_OS:Fetcher;
  MONETIZATION_INGEST_TOKEN?:string;
};

type JsonRecord=Record<string,unknown>;
type EvidenceStage='runtime'|'telegram'|'hermes';
type EvidenceRow={
  operation:string;
  status:string;
  correlation_id:string|null;
  metadata_json:string;
  created_at:string;
};

const MAX_BODY_BYTES=8*1024;
const IDENTIFIER_PATTERN=/^[A-Za-z0-9._:@/-]{1,160}$/;
const HASH_PATTERN=/^[A-Fa-f0-9]{32,128}$/;
const TELEGRAM_COMMANDS=new Set(['/revenue','/profit','/offers','/content','/health','/learning']);
const STAGES=new Set<EvidenceStage>(['runtime','telegram','hermes']);

function json(data:unknown,status=200):Response{
  return new Response(JSON.stringify(data),{
    status,
    headers:{
      'Content-Type':'application/json; charset=utf-8',
      'Cache-Control':'no-store',
      'X-Content-Type-Options':'nosniff',
      'Referrer-Policy':'no-referrer'
    }
  });
}

function isRecord(value:unknown):value is JsonRecord{
  return Boolean(value)&&typeof value==='object'&&!Array.isArray(value);
}

function cleanText(value:unknown,max:number):string|null{
  if(typeof value!=='string')return null;
  const cleaned=value.normalize('NFKC').replace(/[\u0000-\u001f\u007f]/g,'').trim();
  return cleaned?cleaned.slice(0,max):null;
}

function identifier(value:unknown):string|null{
  const candidate=cleanText(value,160);
  return candidate&&IDENTIFIER_PATTERN.test(candidate)?candidate:null;
}

function hexHash(value:unknown):string|null{
  const candidate=cleanText(value,128);
  return candidate&&HASH_PATTERN.test(candidate)?candidate.toLowerCase():null;
}

function parseMetadata(value:string):JsonRecord{
  try{
    const parsed=JSON.parse(value) as unknown;
    return isRecord(parsed)?parsed:{};
  }catch{
    return {};
  }
}

async function readJson(request:Request):Promise<JsonRecord>{
  const contentLength=Number(request.headers.get('Content-Length')??0);
  if(Number.isFinite(contentLength)&&contentLength>MAX_BODY_BYTES)throw new Error('Payload evidence terlalu besar.');
  const raw=await request.text();
  if(new TextEncoder().encode(raw).byteLength>MAX_BODY_BYTES)throw new Error('Payload evidence terlalu besar.');
  const parsed=JSON.parse(raw) as unknown;
  if(!isRecord(parsed))throw new Error('Payload evidence tidak valid.');
  return parsed;
}

async function verifyOpenClaw(request:Request,env:Env):Promise<boolean>{
  const authorization=request.headers.get('Authorization');
  if(!authorization?.startsWith('Bearer '))return false;
  try{
    const response=await env.CONTENT_OS.fetch(new Request('https://content-os.internal/api/internal/openclaw/verify',{
      method:'POST',
      headers:{Authorization:authorization}
    }));
    return response.status===200;
  }catch{
    return false;
  }
}

async function digest(value:string):Promise<string>{
  const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
  return Array.from(new Uint8Array(hash)).map((byte)=>byte.toString(16).padStart(2,'0')).join('');
}

async function acceptanceContract(request:Request,env:Env):Promise<Response>{
  if(!(await verifyOpenClaw(request,env)))return json({ok:false,error:'Unauthorized'},401);
  return json({
    ok:true,
    version:'1.0',
    mode:'evidence-only',
    publishing:false,
    piiStored:false,
    identifiersStoredAs:'sha256-prefix',
    stages:{
      runtime:{required:['stage','correlationId','externalRunId']},
      telegram:{
        required:['stage','correlationId','externalRunId','telegramCommand','transportRunId','deliveryStatus'],
        allowedCommands:[...TELEGRAM_COMMANDS],
        deliveryStatus:'sent'
      },
      hermes:{
        required:['stage','correlationId','externalRunId','hermesRunId','researchBriefHash','resultHash','resultAccepted'],
        hashAlgorithm:'SHA-256',
        resultAccepted:true
      }
    }
  });
}

async function submitEvidence(request:Request,env:Env):Promise<Response>{
  if(!(await verifyOpenClaw(request,env)))return json({ok:false,error:'Unauthorized'},401);

  let body:JsonRecord;
  try{
    body=await readJson(request);
  }catch(error){
    const message=error instanceof SyntaxError?'Body evidence harus berupa JSON valid.':error instanceof Error?error.message:'Payload evidence tidak valid.';
    return json({ok:false,error:message},400);
  }

  const stageValue=cleanText(body.stage,20)?.toLowerCase() as EvidenceStage|undefined;
  if(!stageValue||!STAGES.has(stageValue))return json({ok:false,error:'Stage harus runtime, telegram, atau hermes.'},400);
  const correlationId=identifier(body.correlationId);
  const externalRunId=identifier(body.externalRunId);
  if(!correlationId||!externalRunId)return json({ok:false,error:'correlationId dan externalRunId tidak valid.'},400);

  const metadata:JsonRecord={
    evidenceVersion:'1.0',
    stage:stageValue,
    externalRunIdHash:`sha256:${(await digest(externalRunId)).slice(0,32)}`,
    interface:cleanText(request.headers.get('X-OpenClaw-Interface'),40)?.toLowerCase()??null,
    identifiersStoredAs:'sha256-prefix',
    piiStored:false,
    publishing:false,
    recordedAt:new Date().toISOString()
  };

  if(stageValue==='telegram'){
    const telegramCommand=cleanText(body.telegramCommand,40)?.toLowerCase();
    const transportRunId=identifier(body.transportRunId);
    if(!telegramCommand||!TELEGRAM_COMMANDS.has(telegramCommand)||!transportRunId||body.deliveryStatus!=='sent'){
      return json({ok:false,error:'Evidence Telegram harus memakai command yang diizinkan, transportRunId valid, dan deliveryStatus sent.'},400);
    }
    metadata.telegramCommand=telegramCommand;
    metadata.transportRunIdHash=`sha256:${(await digest(transportRunId)).slice(0,32)}`;
    metadata.deliveryStatus='sent';
  }

  if(stageValue==='hermes'){
    const hermesRunId=identifier(body.hermesRunId);
    const researchBriefHash=hexHash(body.researchBriefHash);
    const resultHash=hexHash(body.resultHash);
    if(!hermesRunId||!researchBriefHash||!resultHash||body.resultAccepted!==true){
      return json({ok:false,error:'Evidence Hermes membutuhkan hermesRunId, dua hash SHA-256/hex, dan resultAccepted true.'},400);
    }
    metadata.hermesRunIdHash=`sha256:${(await digest(hermesRunId)).slice(0,32)}`;
    metadata.researchBriefHash=researchBriefHash;
    metadata.resultHash=resultHash;
    metadata.resultAccepted=true;
  }

  const operation=`external_${stageValue}_acceptance`;
  const correlationHash=`oc-${(await digest(`${stageValue}:${correlationId}`)).slice(0,32)}`;
  const inserted=await env.DB.prepare(`INSERT INTO monetization_integration_logs
    (provider,operation,status,error_code,error_message,correlation_id,metadata_json)
    SELECT 'openclaw',?1,'success',NULL,NULL,?2,?3
    WHERE NOT EXISTS (
      SELECT 1 FROM monetization_integration_logs
      WHERE provider='openclaw' AND operation=?1 AND correlation_id=?2
    )`)
    .bind(operation,correlationHash,JSON.stringify(metadata)).run();
  const evidenceRecorded=Number(inserted.meta.changes??0)>0;

  return json({
    ok:true,
    stage:stageValue,
    evidenceRecorded,
    duplicate:!evidenceRecorded,
    correlationId:correlationHash,
    privacy:{piiStored:false,identifiersStoredAs:'sha256-prefix'}
  },evidenceRecorded?201:200);
}

async function acceptanceStatus(request:Request,env:Env):Promise<Response>{
  if(!env.MONETIZATION_INGEST_TOKEN||request.headers.get('Authorization')!==`Bearer ${env.MONETIZATION_INGEST_TOKEN}`){
    return json({ok:false,error:'Unauthorized'},401);
  }

  const result=await env.DB.prepare(`SELECT operation,status,correlation_id,metadata_json,created_at
    FROM monetization_integration_logs
    WHERE provider='openclaw'
      AND operation IN ('external_runtime_acceptance','external_telegram_acceptance','external_hermes_acceptance')
      AND status='success'
    ORDER BY id DESC LIMIT 100`).all<EvidenceRow>();

  const rows=result.results??[];
  const latest:Partial<Record<EvidenceStage,JsonRecord>>={};
  const counts:Record<EvidenceStage,number>={runtime:0,telegram:0,hermes:0};
  for(const row of rows){
    const metadata=parseMetadata(row.metadata_json);
    const stage=metadata.stage;
    if(stage!=='runtime'&&stage!=='telegram'&&stage!=='hermes')continue;
    counts[stage]+=1;
    if(!latest[stage]){
      latest[stage]={
        status:row.status,
        correlationId:row.correlation_id,
        createdAt:row.created_at,
        metadata
      };
    }
  }

  const gates={
    runtime:Boolean(latest.runtime),
    telegram:Boolean(latest.telegram),
    hermes:Boolean(latest.hermes)
  };
  return json({
    ok:true,
    gates,
    allExternalRuntimeGreen:gates.runtime&&gates.telegram&&gates.hermes,
    counts,
    latest,
    policy:{piiStored:false,identifiersStoredAs:'sha256-prefix',syntheticEvidenceNotAccepted:true}
  });
}

export async function handleExternalAcceptanceRoute(request:Request,env:Env):Promise<Response|null>{
  const url=new URL(request.url);
  if(request.method==='GET'&&url.pathname==='/api/monetization/openclaw/acceptance/contract'){
    return acceptanceContract(request,env);
  }
  if(request.method==='POST'&&url.pathname==='/api/monetization/openclaw/acceptance'){
    return submitEvidence(request,env);
  }
  if(request.method==='GET'&&url.pathname==='/api/monetization/external-acceptance/status'){
    return acceptanceStatus(request,env);
  }
  return null;
}

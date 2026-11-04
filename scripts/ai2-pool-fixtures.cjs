// Dedicated, explicitly synthetic fixture group. Never modify original applications.
const fs=require('node:fs'),path=require('node:path'),{randomUUID}=require('node:crypto'),{Client}=require('pg');
const root=path.resolve(__dirname,'..');
const env={...process.env,...require('dotenv').parse(fs.readFileSync(path.join(root,'.env.local')))};
async function connect(prefix){const c=new Client({host:env.DB_HOST,port:+env.DB_PORT,user:env[prefix+'_DB_USER'],password:env[prefix+'_DB_PASS'],database:env[prefix+'_DB_NAME']});await c.connect();return c;}
async function insert(c,table,record){const keys=Object.keys(record);await c.query(`insert into ${table} (${keys.map(k=>'"'+k+'"').join(',')}) values (${keys.map((_,i)=>'$'+(i+1)).join(',')})`,Object.values(record));}
(async()=>{
 const a=await connect('APPLICATION_SERVICE');
 try{
 const [original]=(await a.query("select * from applications where job_title='Junior Backend Developer — Local AI1 Test' and deleted_at is null limit 1")).rows;
 if(!original)throw new Error('Original fixture missing');
 const j=await connect('JOB_SERVICE');
 const jobId=randomUUID(),title=`AI2 Synthetic Pool E2E ${Date.now()}`;
 try{
 const [job]=(await j.query('select * from jobs where id=$1',[original.job_id])).rows;
 Object.assign(job,{id:jobId,title,description:'Synthetic local test only.',requirements:'Python',skills:['Python'],application_count:3,created_at:new Date(),updated_at:new Date()});
 delete job.search_vector;
 await insert(j,'jobs',job);
 }finally{await j.end()}
 const applications=[];
 for(let i=0;i<3;i++){
 const record={...original,id:randomUUID(),job_id:jobId,job_title:title,candidate_id:randomUUID(),candidate_user_id:randomUUID(),candidate_cv_id:randomUUID(),cv_document_id:randomUUID(),candidate_full_name:`Synthetic AI2 Applicant ${i+1}`,candidate_email:`ai2-fixture-${i+1}@example.invalid`,candidate_phone:null,candidate_avatar_document_id:null,cv_file_name:'synthetic.txt',cv_title:'Synthetic local source',cover_letter:'Synthetic E2E fixture; no real applicant.',auto_match_requested:false,match_score:null,match_level:null,created_at:new Date(),updated_at:new Date(),submitted_at:new Date()};
 await insert(a,'applications',record);
 applications.push({id:record.id,candidateId:record.candidate_id,candidateCvId:record.candidate_cv_id});
 }
 const descriptor={synthetic:true,jobId,title,applications};
 const output=path.join(root,'trainning/_maintenance/ai2-playwright/pool-fixture.json');
 fs.writeFileSync(output,JSON.stringify(descriptor,null,2));console.log(JSON.stringify(descriptor,null,2));
 }finally{await a.end()}
})().catch(e=>{console.error(e.code||e.message);process.exitCode=1});

// api/fetch.js - Fetches NHS England + NHS Scotland + Civil Service jobs
const SUPABASE_URL = 'https://cjvywhempvquppksqeol.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNqdnl3aGVtcHZxdXBwa3NxZW9sIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQ0NzEwOTAsImV4cCI6MjEwMDA0NzA5MH0.Y_jmSqA9ZtVV1DH-CB--m067-GFPAZfDplMyRRJTFqw';

const ADZUNA_ID  = '5741be1c';
const ADZUNA_KEY = '09fc3afc7eda2e7e1375a799f302217e';

const HDRS = {
  'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36',
  'Accept':          'text/html',
  'Accept-Language': 'en-GB,en;q=0.9',
};

function dec(s){return s.replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#039;/g,"'").replace(/&nbsp;/g,' ');}
function clean(s){return dec(s.replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').trim();}
function pickField(block,...attrs){for(const attr of attrs){const re=new RegExp('<li[^>]*data-test="'+attr+'"[^>]*>([\\s\\S]*?)<\\/li>','i');const m=block.match(re);if(m){const v=clean(m[1]).replace(/^[A-Za-z &\/]+:\s*/,'').trim();if(v)return v;}}return '';}

function parseNhs(html){
  const jobs=[];
  const re=/<li[^>]*class="[^"]*\bsearch-result\b[^"]*"[^>]*>([\s\S]*?)(?=<li[^>]*class="[^"]*\bsearch-result\b|<\/ul)/g;
  let m;
  while((m=re.exec(html))!==null){
    const b=m[1];
    const tm=b.match(/<a[^>]*href="(\/candidate\/jobadvert\/[^"]+)"[^>]*data-test="search-result-job-title"[^>]*>([\s\S]*?)<\/a>/i)||b.match(/<a[^>]*data-test="search-result-job-title"[^>]*href="(\/candidate\/jobadvert\/[^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
    if(!tm)continue;
    const href=dec(tm[1]),title=clean(tm[2]);
    if(!title)continue;
    let org='NHS',loc='United Kingdom';
    const lb=b.match(/<div[^>]*data-test="search-result-location"[^>]*>([\s\S]*?)<\/div>\s*<div[^>]*class="nhsuk-grid-row/i);
    if(lb){const inn=lb[1];const om=inn.match(/<h3[^>]*>([\s\S]*?)<div[^>]*class="location-font-size"/i);if(om)org=clean(om[1]);const lm=inn.match(/<div[^>]*class="location-font-size"[^>]*>([\s\S]*?)<\/div>/i);if(lm)loc=clean(lm[1]).replace(/,\s*$/,'');}
    const salary=pickField(b,'search-result-salary'),contract=pickField(b,'search-result-jobType'),pattern=pickField(b,'search-result-workingPattern'),closing=pickField(b,'search-result-closingDate');
    let posted=pickField(b,'search-result-publicationDate');
    if(!posted){const dm=b.match(/(\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4})/i);if(dm)posted=dm[1];}
    const idM=href.match(/\/jobadvert\/([^?#]+)/),id=idM?idM[1]:null;
    if(!id)continue;
    jobs.push({id,title,organisation:org,location:loc,salary,contract,pattern,closing,posted,url:'https://www.jobs.nhs.uk'+href});
  }
  return jobs;
}

async function fetchNhsPage(kw,loc,page,sal,ft){
  const p=new URLSearchParams({keyword:kw,language:'en',contractType:'Permanent',payScheme:'AfC'});
  if(loc)p.set('location',loc);
  if(page>1)p.set('page',String(page));
  if(sal>0)p.set('salaryFrom',String(sal));
  if(ft)p.set('workingPattern','fullTime');
  try{const r=await fetch('https://www.jobs.nhs.uk/candidate/search/results?'+p,{headers:HDRS,signal:AbortSignal.timeout(10000)});if(!r.ok)return[];return parseNhs(await r.text());}catch{return[];}
}

async function fetchAdzunaPage(kw,page){
  const p=new URLSearchParams({app_id:ADZUNA_ID,app_key:ADZUNA_KEY,results_per_page:'20',what:kw,what_and:'civil service government',sort_by:'date','content-type':'application/json'});
  try{
    const r=await fetch('https://api.adzuna.com/v1/api/jobs/gb/search/'+page+'?'+p,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(10000)});
    if(!r.ok)return[];
    const d=await r.json();
    return(d.results||[]).map(j=>({
      id:'cs-'+j.id,
      title:j.title,
      organisation:j.company?.display_name||'Civil Service',
      location:j.location?.display_name||'United Kingdom',
      salary:j.salary_min?'£'+Math.round(j.salary_min).toLocaleString()+(j.salary_max?' to £'+Math.round(j.salary_max).toLocaleString():''):undefined,
      contract:j.contract_time==='permanent'?'Permanent':j.contract_type||undefined,
      pattern:j.full_time?'Full-time':'',
      posted:j.created?j.created.split('T')[0]:undefined,
      closing:undefined,
      url:j.redirect_url,
    }));
  }catch{return[];}
}

async function dbUpsert(jobs,source){
  if(!jobs.length)return;
  const rows=jobs.map(j=>({...j,source,enriched:false}));
  const r=await fetch(SUPABASE_URL+'/rest/v1/jobs',{
    method:'POST',
    headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY,'Content-Type':'application/json','Prefer':'resolution=merge-duplicates'},
    body:JSON.stringify(rows),
  });
  if(!r.ok)console.error('Supabase error:',await r.text());
}

// NHS ENGLAND keywords
const NHS_ENG = {
  'Support Worker': {kw:['healthcare assistant','healthcare support worker','clinical support worker','nursing assistant','ward support worker','therapy support worker','mental health support worker','learning disability support worker','maternity support worker','theatre support worker','community support worker','rehabilitation support worker','assistant practitioner','care navigator','peer support worker','occupational therapy assistant','physiotherapy assistant','operating department support worker','emergency department support worker','critical care support worker','oncology support worker','cardiology support worker','dialysis support worker','palliative care support worker','neonatal support worker','paediatric support worker'],loc:'',sal:25000,ft:true},
  'Admin':          {kw:['administrator','administrative assistant','medical secretary','receptionist','patient pathway coordinator','admissions coordinator','waiting list coordinator','business support officer','project administrator','programme support officer','epr administrator','governance administrator','training administrator','communications manager','office manager','executive assistant'],loc:'',sal:32000,ft:false},
  'HR':             {kw:['human resources','hr adviser','hr officer','hr business partner','workforce administrator','recruitment adviser','employee relations adviser','organisational development','learning and development','esr administrator','wellbeing adviser','edi officer','hr analyst'],loc:'',sal:0,ft:false},
  'Project Manager':{kw:['project manager','programme manager','project support officer','pmo administrator','transformation manager','change manager','improvement manager','programme delivery manager','epr implementation manager'],loc:'',sal:0,ft:false},
  'Business Analyst':{kw:['business analyst','systems analyst','transformation analyst','change analyst','digital analyst','service improvement analyst','clinical systems analyst','epr analyst','process improvement analyst'],loc:'',sal:0,ft:false},
  'Data Analyst':   {kw:['data analyst','data engineer','data scientist','information analyst','reporting analyst','performance analyst','workforce analyst','analytics engineer','population health analyst'],loc:'',sal:0,ft:false},
  'IT':             {kw:['it engineer','network engineer','software developer','software engineer','infrastructure engineer','cyber security','cloud engineer','devops engineer','it support officer','service desk analyst','systems administrator','azure administrator','biomedical engineer','clinical engineer'],loc:'',sal:0,ft:false},
  'Finance':        {kw:['finance officer','finance manager','management accountant','financial accountant','payroll officer','finance business partner','financial analyst'],loc:'',sal:0,ft:false},
  'Estates':        {kw:['estates manager','estates officer','facilities manager','building services manager','capital projects manager','property manager','engineering manager','compliance manager','fire safety manager','energy manager','estates engineer','construction project manager'],loc:'',sal:0,ft:false},
  'Nursing':        {kw:['staff nurse','mental health nurse','research nurse'],loc:'',sal:0,ft:false},
  'Clinical':       {kw:['clinical coder','dietitian','microbiologist','phlebotomist','research assistant','social worker','clinical fellow'],loc:'',sal:0,ft:false},
  'Coordinator':    {kw:['pathway coordinator','care coordinator','referral coordinator','discharge coordinator','admissions coordinator','waiting list coordinator'],loc:'',sal:0,ft:false},
};

// NHS SCOTLAND keywords - same roles but Scottish locations
const SCOT_LOCS = ['Edinburgh','Glasgow','Aberdeen','Dundee','Inverness','Stirling','Perth'];
const SCOT_PLACES = ['edinburgh','glasgow','aberdeen','dundee','inverness','stirling','perth','falkirk','kirkcaldy','paisley','livingston','hamilton','dunfermline','ayr','scotland','scottish','highland','grampian','tayside','lothian','lanarkshire','ayrshire','fife','borders','forth valley','greater glasgow','dumfries'];

function isScottish(loc){const l=(loc||'').toLowerCase();return SCOT_PLACES.some(p=>l.includes(p));}

const NHS_SCOT_KW = ['healthcare assistant','healthcare support worker','clinical support worker','nursing assistant','administrator','medical secretary','receptionist','staff nurse','mental health nurse','hr adviser','project manager','data analyst','it engineer','social worker','estates manager','facilities manager'];

// CIVIL SERVICE keywords
const CS_KW = ['administrator','executive officer','policy officer','hr adviser','project manager','business analyst','data analyst','software developer','cyber security','digital','finance officer','economist','statistician','delivery manager','fraud officer','fraud investigator','caseworker','case worker','case officer'];

export default async function handler(req,res){
  res.setHeader('Access-Control-Allow-Origin','*');
  if(req.method==='OPTIONS'){res.status(200).end();return;}

  const source = req.query.source || 'all';
  const results = {};

  // NHS ENGLAND
  if(source==='all'||source==='england'){
    for(const[category,cfg]of Object.entries(NHS_ENG)){
      const seen=new Set(),batch=[];
      for(const kw of cfg.kw){
        for(let pg=1;pg<=5;pg++){
          const jobs=await fetchNhsPage(kw,cfg.loc,pg,cfg.sal,cfg.ft);
          if(!jobs.length)break;
          let added=0;
          for(const j of jobs){if(seen.has(j.id))continue;seen.add(j.id);batch.push({...j,category,source:'england'});added++;}
          if(!added)break;
        }
      }
      await dbUpsert(batch,'england');
      results['england_'+category]=batch.length;
    }
  }

  // NHS SCOTLAND
  if(source==='all'||source==='scotland'){
    const seen=new Set(),batch=[];
    for(const kw of NHS_SCOT_KW){
      for(const loc of SCOT_LOCS){
        for(let pg=1;pg<=3;pg++){
          const jobs=await fetchNhsPage(kw,loc,pg,0,false);
          if(!jobs.length)break;
          for(const j of jobs){
            if(seen.has(j.id))continue;
            if(!isScottish(j.location))continue;
            seen.add(j.id);
            batch.push({...j,category:'Scotland '+getCatFromTitle(j.title),source:'scotland'});
          }
        }
      }
    }
    await dbUpsert(batch,'scotland');
    results['scotland']=batch.length;
  }

  // CIVIL SERVICE
  if(source==='all'||source==='civil'){
    const seen=new Set(),batch=[];
    for(const kw of CS_KW){
      for(let pg=1;pg<=3;pg++){
        const jobs=await fetchAdzunaPage(kw,pg);
        if(!jobs.length)break;
        let added=0;
        for(const j of jobs){if(seen.has(j.id))continue;seen.add(j.id);batch.push({...j,category:'Civil Service '+getCsCategory(j.title),source:'civil'});added++;}
        if(!added)break;
      }
    }
    await dbUpsert(batch,'civil');
    results['civil_service']=batch.length;
  }

  return res.status(200).json({ok:true,fetched:results,at:new Date().toISOString()});
}

function getCatFromTitle(title){
  const t=(title||'').toLowerCase();
  if(t.includes('nurse')||t.includes('nursing'))return 'Nursing';
  if(t.includes('support worker')||t.includes('healthcare assistant')||t.includes('hca'))return 'Support Worker';
  if(t.includes('social worker'))return 'Social Worker';
  if(t.includes('admin')||t.includes('secretary')||t.includes('receptionist'))return 'Admin';
  if(t.includes('project')||t.includes('programme'))return 'Project Manager';
  if(t.includes('data')||t.includes('analyst')||t.includes('informatics'))return 'Data Analyst';
  if(t.includes('it ')||t.includes('software')||t.includes('engineer')||t.includes('cyber'))return 'IT';
  if(t.includes('estates')||t.includes('facilities'))return 'Estates';
  if(t.includes('hr')||t.includes('workforce')||t.includes('human resources'))return 'HR';
  return 'General';
}

function getCsCategory(title){
  const t=(title||'').toLowerCase();
  if(t.includes('policy'))return 'Policy';
  if(t.includes('data')||t.includes('analyst'))return 'Data';
  if(t.includes('software')||t.includes('developer')||t.includes('engineer'))return 'Technology';
  if(t.includes('cyber')||t.includes('security'))return 'Cyber Security';
  if(t.includes('digital'))return 'Digital';
  if(t.includes('project')||t.includes('programme'))return 'Project Manager';
  if(t.includes('hr')||t.includes('human resources'))return 'HR';
  if(t.includes('finance')||t.includes('accountant'))return 'Finance';
  if(t.includes('admin')||t.includes('officer'))return 'Admin';
  if(t.includes('economist'))return 'Economist';
  return 'General';
}

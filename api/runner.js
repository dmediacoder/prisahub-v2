export default async function handler(req, res) {
  res.setHeader('Content-Type', 'text/html');
  res.status(200).send(`<!DOCTYPE html>
<html>
<head>
<title>Prisahub - Enrich Jobs</title>
<style>
body{font-family:sans-serif;max-width:600px;margin:60px auto;padding:20px;background:#f0f4ff}
.box{background:#fff;border-radius:12px;padding:30px;box-shadow:0 2px 10px rgba(0,0,0,.1)}
h2{color:#1e3a5f;margin-bottom:16px}
.progress{background:#e2e8f0;border-radius:8px;height:20px;margin:16px 0}
.bar{background:linear-gradient(90deg,#3b82f6,#6366f1);height:20px;border-radius:8px;transition:width .5s;width:0%}
.status{font-size:14px;color:#64748b;margin:8px 0}
.count{font-size:24px;font-weight:800;color:#1d4ed8;margin:8px 0}
button{background:#3b82f6;color:#fff;border:none;padding:12px 24px;border-radius:8px;font-size:15px;cursor:pointer;font-weight:600}
button:disabled{opacity:.5;cursor:not-allowed}
</style>
</head>
<body>
<div class="box">
  <h2>🔄 Enrich All Jobs</h2>
  <p style="color:#64748b;margin-bottom:20px">Visits each job page to extract band numbers and sponsorship info. Runs automatically until all jobs are done.</p>
  <div class="progress"><div class="bar" id="bar"></div></div>
  <div class="count" id="count">0 jobs enriched</div>
  <div class="status" id="status">Click Start to begin</div>
  <br/>
  <button id="btn" onclick="start()">▶ Start Enriching</button>
</div>
<script>
var total=0,running=false;
async function start(){
  if(running)return;
  running=true;
  document.getElementById('btn').disabled=true;
  var batches=0;
  while(batches<50){
    document.getElementById('status').textContent='Running batch '+(batches+1)+'...';
    try{
      var r=await fetch('/api/enrich');
      var d=await r.json();
      total+=(d.enriched||0);
      document.getElementById('count').textContent=total+' jobs enriched';
      document.getElementById('bar').style.width=Math.min((batches+1)/15*100,100)+'%';
      if(!d.enriched||d.enriched===0){
        document.getElementById('status').textContent='';
        document.getElementById('count').innerHTML='<span style="color:#059669">✅ All done! '+total+' jobs enriched</span>';
        document.getElementById('bar').style.width='100%';
        document.getElementById('btn').textContent='✅ Complete';
        break;
      }
      batches++;
      await new Promise(r=>setTimeout(r,1000));
    }catch(e){
      document.getElementById('status').textContent='Retrying...';
      await new Promise(r=>setTimeout(r,3000));
    }
  }
  running=false;
}
</script>
</body>
</html>`);
}

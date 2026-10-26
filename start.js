(() => {
  const unzip = async b64 => { const s=atob(b64), a=new Uint8Array(s.length); for(let i=0;i<s.length;i++) a[i]=s.charCodeAt(i); const ds=new DecompressionStream('gzip'); return await new Response(new Blob([a]).stream().pipeThrough(ds)).text(); };
  const get = async u => { const r=await fetch(u,{cache:'no-store'}); if(!r.ok) throw new Error(u+' '+r.status); return await r.text(); };
  (async()=>{ try {
    (0,eval)(await unzip(await get('./remote_meta.txt?v=20261026')));
    let b64=''; for(let i=1;i<=3;i++) b64 += await get('./remote_data_'+i+'.txt?v=20261026');
    (0,eval)(await unzip(b64));
    const s=document.createElement('script'); s.src='./app.js?v=20261026'; s.onerror=()=>document.documentElement.dataset.mapError='app.js load failed'; document.body.appendChild(s);
  } catch(e) { document.documentElement.dataset.mapError=String(e); console.error(e); } })();
})();

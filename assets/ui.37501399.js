(function(){
  /* Sichtbare Texte kommen aus der Seite (window.__I18N__); ohne sie bleibt
     die deutsche Vorgabe stehen. */
  var T=window.__I18N__||{};
  var r=document.documentElement, tb=document.getElementById('theme');
  var st=localStorage.getItem('ft-theme'); if(st) r.setAttribute('data-theme',st);
  tb.onclick=function(){
    var cur=r.getAttribute('data-theme');
    if(!cur) cur=matchMedia('(prefers-color-scheme:dark)').matches?'dark':'light';
    var nx=cur==='dark'?'light':'dark';
    r.setAttribute('data-theme',nx); localStorage.setItem('ft-theme',nx);
    if(window.__redrawMaps) window.__redrawMaps();
  };
  matchMedia('(prefers-color-scheme:dark)').addEventListener('change',function(){
    if(window.__redrawMaps) window.__redrawMaps();
  });

  var F={y:'',role:'',type:'',tag:''}, q='';
  var items=[].slice.call(document.querySelectorAll('.fl'));
  var cnt=document.getElementById('cnt'), empty=document.getElementById('empty');

  function apply(){
    var n=0;
    items.forEach(function(el){
      var ok = (!F.y || el.dataset.y===F.y)
        && (!F.type || el.dataset.type===F.type)
        && (!F.role || (F.role==='solo' ? el.dataset.solo==='1' : el.dataset.role===F.role))
        && (!F.tag || (F.tag==='mile' ? el.dataset.mile==='1'
             : F.tag==='night' ? el.dataset.night==='1'
             : el.dataset.video==='1'))
        && (!q || el.dataset.s.indexOf(q)>-1);
      el.classList.toggle('hide',!ok); if(ok) n++;
    });
    document.querySelectorAll('.ch').forEach(function(ch){
      var vis=ch.querySelectorAll('.fl:not(.hide)').length;
      ch.style.display = vis? '' : 'none';
    });
    cnt.textContent = n===1 ? (T.count_one||'1 Flug')
                            : (T.count_many||'{n} Flüge').replace('{n}',n);
    empty.style.display = n? 'none':'block';
  }

  document.querySelectorAll('.fg').forEach(function(g){
    g.addEventListener('click',function(e){
      var b=e.target.closest('button'); if(!b) return;
      g.querySelectorAll('button').forEach(function(x){x.setAttribute('aria-pressed','false');});
      b.setAttribute('aria-pressed','true');
      F[g.dataset.f]=b.dataset.v; apply();
    });
  });

  /* Der Player wird erst auf Klick geladen. Liegt die Seite auf file://, gibt es keinen
     gültigen Referrer und YouTube verweigert das Einbetten (Fehler 153) — dann öffnen
     wir stattdessen youtube.com in einem neuen Tab. */
  var canEmbed = location.protocol==='http:' || location.protocol==='https:';
  document.querySelectorAll('.vid-f').forEach(function(b){
    if(!canEmbed){
      b.classList.add('vid-ext');
      b.title=T.opens_youtube||'Öffnet auf YouTube';
      var x=document.createElement('span');
      x.className='vid-x'; x.textContent='↗ YouTube';
      b.appendChild(x);
    }
    b.addEventListener('click',function(){
      if(!canEmbed){
        window.open('https://www.youtube.com/watch?v='+b.dataset.v,'_blank','noopener');
        return;
      }
      var f=document.createElement('iframe');
      f.src='https://www.youtube-nocookie.com/embed/'+b.dataset.v+'?autoplay=1&rel=0';
      f.title=b.dataset.t||T.video||'Video';
      f.allow='accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
      f.allowFullscreen=true;
      b.replaceWith(f);
    });
  });

  var qi=document.getElementById('q');
  qi.addEventListener('input',function(){ q=qi.value.trim().toLowerCase(); apply(); });
})();

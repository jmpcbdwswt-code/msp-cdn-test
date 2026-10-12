/* My Science Planet - external space/planet renderer
   Loaded by the main page so the planet implementation is not embedded in View Source. */

(function(){
  function install(){
    ["nasa-earth-wrap","photo-earth","real-earth-stage","rotating-earth-wrap","space-moon"].forEach(function(id){
      var old=document.getElementById(id);
      if(old) old.remove();
    });
    if(document.getElementById("living-space")) return;

    var space=document.createElement("div");
    space.id="living-space";
    space.setAttribute("aria-hidden","true");

    var stars=document.createElement("div");
    stars.id="star-layer";

    var video=document.createElement("video");
    video.id="living-earth-video";
    video.autoplay=true;
    video.loop=true;
    video.muted=true;
    video.playsInline=true;
    video.preload="auto";
    video.src="https://svs.gsfc.nasa.gov/vis/a030000/a030800/a030878/BlackMarble_2016_rotate_1080p.mp4";

    /* A little faster than the last version, but still slow and calm. */
    function startEarth(){
      video.defaultPlaybackRate=1.6;
      video.playbackRate=1.6;
      video.play().catch(function(){});
    }
    video.addEventListener("loadedmetadata",startEarth);
    video.addEventListener("canplay",startEarth);

    var green=document.createElement("div");
    green.id="earth-green-life";

    var moon=document.createElement("div");
    moon.id="real-moon";

    var sun=document.createElement("div");
    sun.id="real-sun";

    var meteor1=document.createElement("div");
    meteor1.className="meteor m1";
    var meteor2=document.createElement("div");
    meteor2.className="meteor m2";

    var vignette=document.createElement("div");
    vignette.id="space-vignette";

    space.append(stars,video,green,moon,sun,meteor1,meteor2,vignette);
    document.body.insertBefore(space,document.body.firstChild.nextSibling);
  }

  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded",install);
  else install();
})();

(() => {
  function loadImage(src){
    return new Promise((resolve,reject)=>{
      const im=new Image();
      im.onload=()=>resolve(im);
      im.onerror=reject;
      im.src=src;
    });
  }

  function makeSphere(hostId, textureURL, kind){
    const host=document.getElementById(hostId);
    if(!host) return;

    const cssSize=Math.max(180, Math.round(host.getBoundingClientRect().width*1.45));
    const size=Math.min(520, Math.max(300, Math.round(cssSize*(window.devicePixelRatio||1))));
    const canvas=document.createElement("canvas");
    canvas.className="planet-sphere-canvas";
    canvas.width=size; canvas.height=size;
    host.appendChild(canvas);

    loadImage(textureURL).then(img=>{
      const tex=document.createElement("canvas");
      tex.width=768; tex.height=768;
      const tctx=tex.getContext("2d",{willReadFrequently:true});
      tctx.drawImage(img,0,0,768,768);
      const td=tctx.getImageData(0,0,768,768).data;

      const ctx=canvas.getContext("2d");
      const out=ctx.createImageData(size,size);
      const d=out.data;
      const cx=size/2, cy=size/2, radius=size*0.355;

      // Fixed light direction. The sphere itself never rotates.
      let lx=-0.48, ly=-0.42, lz=0.77;
      const ll=Math.hypot(lx,ly,lz); lx/=ll; ly/=ll; lz/=ll;

      for(let y=0;y<size;y++){
        for(let x=0;x<size;x++){
          const nx=(x-cx)/radius, ny=(y-cy)/radius;
          const r2=nx*nx+ny*ny;
          const oi=(y*size+x)*4;
          if(r2>1){ d[oi+3]=0; continue; }

          const nz=Math.sqrt(1-r2);

          // Spherical UV projection: texture compresses toward the limb.
          const lon=Math.atan2(nx,nz);
          const lat=Math.asin(-ny);
          let u=0.5+lon/(2*Math.PI);
          let v=0.5-lat/Math.PI;

          // Use central portion of the source artwork as the wrapped surface.
          u=0.17+u*0.66;
          v=0.17+v*0.66;
          const tx=Math.max(0,Math.min(767,Math.floor(u*767)));
          const ty=Math.max(0,Math.min(767,Math.floor(v*767)));
          const ti=(ty*768+tx)*4;

          let rr=td[ti], gg=td[ti+1], bb=td[ti+2];

          const diffuse=Math.max(0,nx*lx+ny*ly+nz*lz);
          const limb=Math.pow(nz,0.42);

          if(kind==="moon"){
            const light=0.34+0.76*diffuse;
            const edge=0.48+0.52*limb;
            rr*=light*edge; gg*=light*edge; bb*=light*edge;
          }else{
            // Self-luminous sphere, but still with curvature and limb depth.
            const light=0.76+0.24*diffuse;
            const edge=0.68+0.32*limb;
            rr*=light*edge; gg*=light*edge; bb*=light*edge;
            rr=Math.min(255,rr*1.10+12);
            gg=Math.min(255,gg*1.02+4);
            bb=Math.min(255,bb*0.90);
          }

          // Thin curved rim catches light and makes silhouette read as a sphere.
          const rim=Math.pow(1-nz,5);
          if(kind==="moon"){
            rr+=rim*20; gg+=rim*22; bb+=rim*25;
          }else{
            rr+=rim*45; gg+=rim*20; bb+=rim*4;
          }

          d[oi]=Math.max(0,Math.min(255,rr));
          d[oi+1]=Math.max(0,Math.min(255,gg));
          d[oi+2]=Math.max(0,Math.min(255,bb));
          d[oi+3]=255;
        }
      }

      ctx.putImageData(out,0,0);
      host.classList.add("sphere-canvas-ready");
    }).catch(err=>{
      console.error("Sphere texture failed:",hostId,err);
      // Leave the existing CSS artwork visible if the LOCAL texture itself fails.
    });
  }

  makeSphere("real-moon","assets/moon-texture.jpg","moon");
  makeSphere("real-sun","assets/sun-texture.jpg","sun");
})();

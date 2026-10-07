/** Céu e poeira de Kessar-9. Uma única direção solar governa disco e sombras. */
import React, { useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { superficieEm } from './f14Terreno';

export const SOL = new THREE.Vector3(.55, .32, -.8).normalize();

/** O céu como material (usado pela cúpula e para acender o ambiente via PMREM). */
export function materialCeu(): THREE.ShaderMaterial {
    return new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false, fog: false,
        uniforms: { sun: { value: SOL }, tempo: { value: 0 } },
        vertexShader: 'varying vec3 direction; void main(){direction=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
        fragmentShader: `varying vec3 direction; uniform vec3 sun; uniform float tempo;
        float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        float vn(vec2 x){vec2 i=floor(x),f=fract(x);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
        float fbm2(vec2 p){float s=0.,a=.5;for(int i=0;i<5;i++){s+=a*vn(p);p=p*2.07+11.3;a*=.5;}return s;}
        void main(){
          vec3 v=normalize(direction); float h=v.y;
          // gradiente: horizonte cor de pêssego queimado, meio malva, zênite índigo
          vec3 hor=vec3(.98,.60,.36), meio=vec3(.55,.30,.42), zen=vec3(.07,.07,.19);
          vec3 c=mix(hor,meio,smoothstep(0.,.20,h)); c=mix(c,zen,smoothstep(.16,.85,h));
          if(h<0.) c=mix(hor*.9,vec3(.42,.27,.22),smoothstep(0.,-.25,h));
          float sd=max(dot(v,sun),0.);
          // halo de Mie quente e o disco do sol
          c+=vec3(1.,.58,.30)*(pow(sd,5.)*.22+pow(sd,42.)*.45);
          c+=vec3(5.,4.2,3.)*smoothstep(.99975,.99988,sd);
          // faixa de poeira no horizonte
          c=mix(c,vec3(1.,.70,.47),exp(-abs(h)*16.)*.42);
          // nuvens altas (cirros): ruído esticado no vento, acesas por trás pelo sol
          vec2 uv=v.xz/(max(h,.02)+.10);
          float n=fbm2(vec2(uv.x*.55+tempo*.006,uv.y*2.1)+fbm2(uv*.7)*1.3);
          float nuv=smoothstep(.52,.86,n)*smoothstep(.015,.14,h)*(1.-smoothstep(.45,.85,h));
          vec3 corNuv=mix(vec3(.92,.66,.58),vec3(1.,.84,.62),pow(sd,3.))*(.75+pow(sd,8.)*1.6);
          c=mix(c,corNuv,nuv*.65);
          // o segundo sol, pequeno e frio
          vec3 second=normalize(vec3(-.3,.12,-.95));
          float s2=max(dot(v,second),0.); c+=vec3(.7,.85,1.)*(pow(s2,2600.)*3.+pow(s2,60.)*.08);
          // estrelas fracas no alto
          vec2 q=floor(v.xz/(h+1.)*520.); c+=vec3(.9)*step(.9975,hash(q))*smoothstep(.45,.9,h)*.7;
          // o gigante gasoso: interseção raio/esfera, terminador iluminado pelo mesmo sol
          vec3 center=vec3(-300.,300.,-640.); float radius=105.;
          float b=dot(v,center), disc=b*b-dot(center,center)+radius*radius;
          float planetT=10000.;
          if(disc>0. && b>0.) {
            planetT=b-sqrt(disc); vec3 pn=normalize(v*planetT-center);
            float lat=asin(pn.y), bands=sin(lat*26.+sin(pn.x*5.+lat*3.)*.4)*.5+.5, tempest=smoothstep(.8,.95,1.-length(vec2(pn.x+.35,pn.y+.25))*3.);
            vec3 gas=mix(vec3(.62,.44,.40),vec3(.86,.70,.55),bands*.6+.2); gas=mix(gas,vec3(.75,.38,.30),tempest*.6);
            float light=max(dot(pn,sun),0.);
            vec3 atmo=vec3(.95,.70,.55)*pow(1.-max(dot(pn,-v),0.),3.)*.5;
            c=gas*(.07+light*1.05)+atmo;
          }
          vec3 rn=normalize(vec3(.24,.86,.45)); float den=dot(v,rn);
          float rt=dot(center,rn)/den; vec3 rp=v*rt-center; float rr=length(rp);
          if(abs(den)>.0001 && rt>0. && rt<planetT && rr>136. && rr<215.) {
            float bandsR=.58+.14*sin(rr*.45)+.08*sin(rr*1.7);
            float edge=smoothstep(136.,140.,rr)*(1.-smoothstep(209.,215.,rr));
            float gap=1.-smoothstep(176.,177.,rr)*(1.-smoothstep(183.,184.,rr));
            c=mix(c,vec3(.86,.70,.56),edge*gap*bandsR*.7);
          }
          c+=(hash(gl_FragCoord.xy)-.5)/255.;
          gl_FragColor=vec4(c,1.);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
}

export function CeuKessar() {
    const dome = useRef<THREE.Mesh>(null);
    const material = useMemo(materialCeu, []);
    useFrame(({camera, clock})=>{if(dome.current)dome.current.position.copy(camera.position); material.uniforms.tempo.value = clock.elapsedTime;});
    React.useEffect(() => () => material.dispose(), [material]);
    return <mesh ref={dome} material={material} renderOrder={-10}><sphereGeometry args={[900,48,24]} /></mesh>;
}

/** O céu acende o mundo: um mapa de ambiente (PMREM) feito do próprio céu, uma vez. */
export function AmbienteDoCeu({ intensidade = .55 }: { intensidade?: number }) {
    const { gl, scene } = useThree();
    React.useEffect(() => {
        const pm = new THREE.PMREMGenerator(gl), ceu = new THREE.Scene(), mat = materialCeu();
        ceu.add(new THREE.Mesh(new THREE.SphereGeometry(500, 48, 24), mat));
        const alvo = pm.fromScene(ceu, 0, .1, 1000);
        const antes = scene.environment, antesI = scene.environmentIntensity;
        scene.environment = alvo.texture; scene.environmentIntensity = intensidade;
        return () => { scene.environment = antes; scene.environmentIntensity = antesI; alvo.dispose(); pm.dispose(); mat.dispose(); };
    }, [gl, scene, intensidade]);
    return null;
}

/** Partículas perto do solo, um único draw call; sem transparência transmissiva. */
export function PoeiraKessar({reduzida=false}:{reduzida?:boolean}) {
    const points=useRef<THREE.Points>(null);
    const {geo,mat}=useMemo(()=>{
        const count=reduzida?100:260, positions=new Float32Array(count*3);
        let seed=714; const random=()=>((seed=(seed*16807)%2147483647)/2147483647);
        for(let i=0;i<count;i++)positions.set([(random()-.5)*70,random()*1.8,(random()-.5)*70],i*3);
        const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(positions,3));
        const mat=new THREE.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{time:{value:0},origin:{value:new THREE.Vector3()},pixelRatio:{value:1}},
            vertexShader:`uniform float time; uniform vec3 origin; uniform float pixelRatio; varying float alpha;
            void main(){vec3 p=position; p.x=mod(p.x+time*1.3+35.,70.)-35.;
              p.z=mod(p.z+time*.22+35.,70.)-35.;
              float fade=1.-smoothstep(20.,35.,length(p.xz)); alpha=fade*.16;
              vec4 mv=modelViewMatrix*vec4(p+origin,1.); gl_Position=projectionMatrix*mv;
              gl_PointSize=clamp(18.*pixelRatio/max(2.,-mv.z),1.,5.);}`,
            fragmentShader:`varying float alpha; void main(){float d=length(gl_PointCoord-.5)*2.;gl_FragColor=vec4(.78,.60,.40,alpha*(1.-smoothstep(.1,1.,d)));}`,
        });return {geo,mat};
    },[reduzida]);
    useFrame(({clock,camera,gl})=>{mat.uniforms.time.value=clock.elapsedTime;mat.uniforms.pixelRatio.value=gl.getPixelRatio();mat.uniforms.origin.value.set(camera.position.x,superficieEm(camera.position.x,camera.position.z)+.15,camera.position.z);});
    React.useEffect(()=>()=>{geo.dispose();mat.dispose();},[geo,mat]);
    return <points ref={points} geometry={geo} material={mat} frustumCulled={false}/>;
}

/** Cascalho depositado nas dunas: escala humana e contato, em um único lote. */
export function CascalhoKessar({reduzida=false}:{reduzida?:boolean}) {
    const ref=useRef<THREE.InstancedMesh>(null), count=reduzida?600:1400;
    React.useEffect(()=>{
        const m=ref.current;if(!m)return;
        let seed=1407;const random=()=>((seed=seed*16807%2147483647)/2147483647);
        const o=new THREE.Object3D(),c=new THREE.Color();
        for(let i=0;i<count;i++){
            const a=random()*Math.PI*2, r=2+Math.sqrt(random())*65, x=Math.cos(a)*r,z=Math.sin(a)*r;
            const s=.025+Math.pow(random(),3)*.14;
            o.position.set(x,superficieEm(x,z)+s*.08,z);o.rotation.set(random(),a,random());o.scale.set(s,s*.45,s*.75);o.updateMatrix();m.setMatrixAt(i,o.matrix);
            c.set('#8d7962').multiplyScalar(.6+random()*.5);m.setColorAt(i,c);
        }
        m.instanceMatrix.needsUpdate=true;if(m.instanceColor)m.instanceColor.needsUpdate=true;
        m.computeBoundingSphere();
    },[count]);
    return <instancedMesh ref={ref} args={[undefined,undefined,count]} receiveShadow><icosahedronGeometry args={[1,0]}/><meshStandardMaterial roughness={.96}/></instancedMesh>;
}

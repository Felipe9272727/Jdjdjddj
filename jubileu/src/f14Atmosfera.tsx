/** Céu e poeira de Kessar-9. Uma única direção solar governa disco e sombras. */
import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { superficieEm } from './f14Terreno';

export const SOL = new THREE.Vector3(.55, .32, -.8).normalize();

export function CeuKessar() {
    const dome = useRef<THREE.Mesh>(null);
    const material = useMemo(() => new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false, fog: false,
        uniforms: { sun: { value: SOL } },
        vertexShader: 'varying vec3 direction; void main(){direction=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
        fragmentShader: `varying vec3 direction; uniform vec3 sun;
        float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
        void main(){
          vec3 v=normalize(direction); float h=max(v.y,0.);
          vec3 c=mix(vec3(.69,.40,.24),vec3(.24,.19,.28),smoothstep(0.,.42,h));
          c=mix(c,vec3(.025,.038,.078),smoothstep(.25,1.,h));
          float sd=dot(v,sun);
          c+=vec3(1.,.69,.38)*(pow(max(sd,0.),24.)*.20+pow(max(sd,0.),320.)*.30);
          c+=vec3(4.,3.2,2.1)*smoothstep(.99982,.99992,sd);
          vec3 second=normalize(vec3(-.3,.12,-.95));
          c+=vec3(.55,.66,.80)*pow(max(dot(v,second),0.),2200.);
          // Planeta: interseção raio/esfera, com terminador iluminado pelo mesmo sol.
          vec3 center=vec3(-260.,330.,-620.); float radius=70.;
          float b=dot(v,center), disc=b*b-dot(center,center)+radius*radius;
          float planetT=10000.;
          if(disc>0. && b>0.) {
            planetT=b-sqrt(disc); vec3 n=normalize(v*planetT-center);
            float lat=asin(n.y), bands=sin(lat*24.+sin(n.x*5.)*.3)*.5+.5;
            vec3 gas=mix(vec3(.38,.31,.30),vec3(.58,.47,.39),bands*.55+.2);
            float light=max(dot(n,sun),0.);
            c=gas*(.09+light*.95)+vec3(.15,.18,.28)*pow(1.-max(dot(n,-v),0.),3.)*.28;
          }
          // Un seul plan incliné, occulté par le globe; bandes radiales et division.
          vec3 rn=normalize(vec3(.24,.86,.45)); float den=dot(v,rn);
          float rt=dot(center,rn)/den; vec3 rp=v*rt-center; float rr=length(rp);
          if(abs(den)>.0001 && rt>0. && rt<planetT && rr>91. && rr<145.) {
            float bands=.58+.12*sin(rr*.55);
            float edge=smoothstep(91.,94.,rr)*(1.-smoothstep(141.,145.,rr));
            float gap=1.-smoothstep(119.,120.,rr)*(1.-smoothstep(124.,125.,rr));
            c=mix(c,vec3(.56,.43,.32),edge*gap*bands*.8);
          }
          c+=(hash(gl_FragCoord.xy)-.5)/255.;
          gl_FragColor=vec4(c,1.);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }), []);
    useFrame(({camera})=>{if(dome.current)dome.current.position.copy(camera.position);});
    return <mesh ref={dome} material={material} renderOrder={-10}><sphereGeometry args={[900,32,16]} /></mesh>;
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

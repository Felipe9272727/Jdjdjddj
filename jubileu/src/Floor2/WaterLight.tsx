import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { AdditiveBlending, DoubleSide, Group, ShaderMaterial, Vector3 } from 'three';
import { HOLE_CENTER_X, HOLE_CENTER_Z, SWIM_THRESHOLD_Y, WATER_LEVEL_Y } from './constants';

/** Three soft sheets, wholly submerged. The previous cones pierced the dry cave. */
export function WaterLight({ playerPositionRef }: {playerPositionRef: React.MutableRefObject<Vector3>}) {
    const group = useRef<Group>(null);
    const material = useMemo(() => new ShaderMaterial({
        transparent:true, depthWrite:false, side:DoubleSide, blending:AdditiveBlending,
        uniforms:{time:{value:0}},
        vertexShader:`varying vec2 vUv; void main(){vUv=uv;vec3 p=position;p.x*=mix(1.3,.32,uv.y);gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0);}`,
        fragmentShader:`uniform float time; varying vec2 vUv;
          void main(){
            float side=pow(max(0.0,1.0-abs(vUv.x-.5)*2.0),2.5);
            float ends=smoothstep(0.0,.12,vUv.y)*(1.0-smoothstep(.92,1.0,vUv.y));
            float drift=.85+.15*sin(vUv.x*20.0+time*.3+vUv.y*4.0);
            gl_FragColor=vec4(.13,.46,.50,side*ends*drift*.065);
          }`,
    }), []);
    useEffect(() => () => material.dispose(), [material]);
    useFrame(({clock}) => {
        if (group.current) group.current.visible=playerPositionRef.current.y<SWIM_THRESHOLD_Y;
        material.uniforms.time.value=clock.elapsedTime;
    });
    const height=26;
    return <group ref={group} visible={false} position={[HOLE_CENTER_X,WATER_LEVEL_Y-.15-height/2,HOLE_CENTER_Z]}>
        {[0,Math.PI/3,Math.PI*2/3].map(angle => <mesh key={angle} rotation={[0,angle,0]} material={material}>
            <planeGeometry args={[7,height]} />
        </mesh>)}
    </group>;
}

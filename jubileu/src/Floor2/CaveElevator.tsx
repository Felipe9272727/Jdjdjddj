import { useEffect, useMemo } from 'react';
import { CanvasTexture, SRGBColorSpace } from 'three';

/** Local materials keep a remote wallpaper outage from suspending the whole cave. */
export function CaveElevator() {
    const plaque = useMemo(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 768; canvas.height = 160;
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#13201f'; ctx.fillRect(0, 0, 768, 160);
        ctx.strokeStyle = '#8e8e65'; ctx.lineWidth = 3; ctx.strokeRect(9, 9, 750, 142);
        ctx.fillStyle = '#cfbf86'; ctx.font = 'bold 72px Georgia'; ctx.fillText('02', 32, 111);
        ctx.fillStyle = '#e3dfc8'; ctx.font = '28px Georgia'; ctx.fillText('RESERVATÓRIO', 167, 77);
        ctx.fillStyle = '#9aaca4'; ctx.font = '18px sans-serif'; ctx.fillText('THE NORMAL ELEVATOR', 170, 114);
        const texture = new CanvasTexture(canvas); texture.colorSpace = SRGBColorSpace;
        return texture;
    }, []);
    useEffect(() => () => plaque.dispose(), [plaque]);
    return <group>
        {[-1, 1].map(side => <group key={side} position={[side * 3.5, 2.5, 0]}>
            <mesh><boxGeometry args={[3, 5, .5]} /><meshStandardMaterial color="#4c554c" roughness={.86} /></mesh>
            {[.65, 1.9, 3.15, 4.4].map(y => <mesh key={y} position={[0, y - 2.5, .27]}>
                <boxGeometry args={[2.96, .025, .02]} /><meshStandardMaterial color="#1e2927" />
            </mesh>)}
            <mesh position={[-side * 1.37, 0, .33]}><boxGeometry args={[.16, 4.8, .25]} /><meshStandardMaterial color="#8d8053" metalness={.65} roughness={.42} /></mesh>
        </group>)}
        <mesh position={[0, 4.1, 0]}><boxGeometry args={[4, 1.8, .5]} /><meshStandardMaterial color="#39473e" roughness={.9} /></mesh>
        <mesh position={[0, 4.25, .28]}><planeGeometry args={[3.5, .73]} /><meshBasicMaterial map={plaque} /></mesh>
        <mesh position={[0, 3.35, .4]}><boxGeometry args={[4.1, .12, .65]} /><meshStandardMaterial color="#8d8053" metalness={.6} roughness={.5} /></mesh>
        <mesh position={[2.28, 1.3, .34]}><boxGeometry args={[.22, .44, .12]} /><meshStandardMaterial color="#756b46" metalness={.6} roughness={.4} /></mesh>
        <mesh position={[2.28, 1.35, .42]}><sphereGeometry args={[.045, 8, 6]} /><meshBasicMaterial color="#bdd9ac" /></mesh>
    </group>;
}

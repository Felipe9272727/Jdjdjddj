/**
 * SceneInspector — visual debug overlay that maps every object in the scene.
 *
 * Features:
 *  - Wireframe bounding boxes around every mesh (green = procedural, cyan = GLB)
 *  - HTML labels with name, type, world position, world size
 *  - Logs a full table to console on mount
 *  - Toggle with F1 key
 *
 * Usage: <SceneInspector /> inside your Canvas (anywhere).
 */

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';

interface ObjInfo {
    id: number;
    name: string;
    type: string;
    isMesh: boolean;
    isBone: boolean;
    isGroup: boolean;
    worldPos: [number, number, number];
    worldSize: [number, number, number];
    localPos: [number, number, number];
    localRot: [number, number, number];
    localScale: [number, number, number];
    parentName: string;
    depth: number;
    geometryType: string;
    source: 'glb' | 'procedural' | 'unknown';
    ref: THREE.Object3D;
}

function classifySource(obj: THREE.Object3D): 'glb' | 'procedural' | 'unknown' {
    // Walk up — if any ancestor has userData.gltfExtensions or is a Scene, it's GLB
    let cur: THREE.Object3D | null = obj;
    while (cur) {
        if ((cur as any).userData?.gltfExtensions || cur.type === 'Scene') return 'glb';
        cur = cur.parent;
    }
    // Check if geometry was created inline (BoxGeometry, CylinderGeometry, etc.)
    if ((obj as any).isMesh) {
        const mesh = obj as THREE.Mesh;
        const geo = mesh.geometry;
        if (geo?.type && !geo.type.includes('BufferGeometry')) return 'procedural';
        // If it has a name that looks like a GLB node, it's GLB
        if (obj.name && (obj.name.includes('mixamorig') || obj.name.includes('tripo_') || obj.name.includes('Armature'))) return 'glb';
    }
    return 'procedural';
}

function getGeoType(obj: THREE.Object3D): string {
    if (!(obj as any).isMesh) return '';
    const geo = (obj as THREE.Mesh).geometry;
    return geo?.type || 'unknown';
}

export const SceneInspector = () => {
    const { scene } = useThree();
    const [visible, setVisible] = useState(false);
    const [objects, setObjects] = useState<ObjInfo[]>([]);
    const scanned = useRef(false);

    // Toggle with F1
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if (e.key === 'F1') {
                e.preventDefault();
                setVisible(v => !v);
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, []);

    // Scan scene once
    useEffect(() => {
        if (scanned.current) return;
        scanned.current = true;

        const results: ObjInfo[] = [];
        let id = 0;

        scene.traverse((obj) => {
            const isMesh = (obj as any).isMesh;
            const isBone = (obj as any).isBone;
            const isGroup = obj.type === 'Group';

            // Compute world bounding box
            let worldPos: [number, number, number] = [0, 0, 0];
            let worldSize: [number, number, number] = [0, 0, 0];

            if (isMesh || isGroup) {
                const box = new THREE.Box3().setFromObject(obj);
                const center = new THREE.Vector3();
                const size = new THREE.Vector3();
                box.getCenter(center);
                box.getSize(size);
                worldPos = [round(center.x), round(center.y), round(center.z)];
                worldSize = [round(size.x), round(size.y), round(size.z)];
            } else {
                const wp = new THREE.Vector3();
                obj.getWorldPosition(wp);
                worldPos = [round(wp.x), round(wp.y), round(wp.z)];
            }

            results.push({
                id: id++,
                name: obj.name || '(unnamed)',
                type: obj.type,
                isMesh,
                isBone,
                isGroup,
                worldPos,
                worldSize,
                localPos: [round(obj.position.x), round(obj.position.y), round(obj.position.z)],
                localRot: [round(obj.rotation.x), round(obj.rotation.y), round(obj.rotation.z)],
                localScale: [round(obj.scale.x), round(obj.scale.y), round(obj.scale.z)],
                parentName: obj.parent?.name || '(root)',
                depth: getDepth(obj),
                geometryType: getGeoType(obj),
                source: classifySource(obj),
                ref: obj,
            });
        });

        setObjects(results);

        // Also log to console
        console.group('🔍 Scene Inspector — Full Scene Map');
        console.table(results.map(o => ({
            name: o.name,
            type: o.type,
            source: o.source,
            worldPos: o.worldPos.join(', '),
            worldSize: o.worldSize.join(', '),
            localPos: o.localPos.join(', '),
            parent: o.parentName,
            depth: o.depth,
        })));
        console.groupEnd();
    }, [scene]);

    if (!visible) return null;

    // Filter: only show meshes and groups with actual size
    const significant = objects.filter(o =>
        (o.isMesh || o.isGroup) &&
        (o.worldSize[0] > 0.01 || o.worldSize[1] > 0.01 || o.worldSize[2] > 0.01)
    );

    return (
        <group>
            {significant.map((obj) => (
                <DebugBox key={obj.id} info={obj} />
            ))}
        </group>
    );
};

const DebugBox = React.memo(({ info }: { info: ObjInfo }) => {
    const meshRef = useRef<THREE.LineSegments>(null);
    const box = useMemo(() => {
        const b = new THREE.Box3().setFromObject(info.ref);
        return b;
    }, [info.ref]);

    const geo = useMemo(() => {
        return new THREE.BoxGeometry(
            box.max.x - box.min.x,
            box.max.y - box.min.y,
            box.max.z - box.min.z
        );
    }, [box]);

    const edges = useMemo(() => new THREE.EdgesGeometry(geo), [geo]);

    const center = useMemo(() => {
        const c = new THREE.Vector3();
        box.getCenter(c);
        return c;
    }, [box]);

    const color = info.source === 'glb' ? '#00ffff' : '#00ff00';

    return (
        <group>
            <lineSegments position={center} geometry={edges}>
                <lineBasicMaterial color={color} transparent opacity={0.6} />
            </lineSegments>
            <Html position={[center.x, box.max.y + 0.1, center.z]} center style={{ pointerEvents: 'none' }}>
                <div style={{
                    background: 'rgba(0,0,0,0.85)',
                    color,
                    fontFamily: 'monospace',
                    fontSize: '9px',
                    padding: '3px 5px',
                    borderRadius: '3px',
                    whiteSpace: 'nowrap',
                    lineHeight: '1.3',
                    border: `1px solid ${color}`,
                }}>
                    <b>{info.name}</b> ({info.source})<br />
                    pos: [{info.worldPos.join(', ')}]<br />
                    size: [{info.worldSize.join(', ')}]
                </div>
            </Html>
        </group>
    );
});

function round(n: number): number {
    return Math.round(n * 1000) / 1000;
}

function getDepth(obj: THREE.Object3D): number {
    let d = 0;
    let cur: THREE.Object3D | null = obj;
    while (cur.parent) { d++; cur = cur.parent; }
    return d;
}

export default SceneInspector;

import React from 'react';
import { COLORS } from './constants';

export const Sofa = React.memo(({ x, z, rot }: any) => (
    <group position={[x, 0, z]} rotation={[0, rot, 0]}>
        <mesh position={[0, 0.3, 0]}><boxGeometry args={[2, 0.6, 0.8]} /><meshStandardMaterial color={COLORS.sofa} roughness={0.9} /></mesh>
        <mesh position={[0, 0.7, -0.3]}><boxGeometry args={[2, 0.8, 0.2]} /><meshStandardMaterial color={COLORS.sofa} roughness={0.9} /></mesh>
        <mesh position={[-0.9, 0.5, 0]}><boxGeometry args={[0.2, 0.5, 0.8]} /><meshStandardMaterial color={COLORS.sofa} roughness={0.9} /></mesh>
        <mesh position={[0.9, 0.5, 0]}><boxGeometry args={[0.2, 0.5, 0.8]} /><meshStandardMaterial color={COLORS.sofa} roughness={0.9} /></mesh>
    </group>
));

export const CoffeeTable = React.memo(({ x, z }: any) => (
    <group position={[x, 0, z]}>
        <mesh position={[0, 0.35, 0]}><boxGeometry args={[1.2, 0.05, 0.8]} /><meshStandardMaterial color="#3E2723" roughness={0.2} /></mesh>
        {[[-0.5,-0.3],[-0.5,0.3],[0.5,-0.3],[0.5,0.3]].map((p,i) => (
            <mesh key={i} position={[p[0], 0.17, p[1]]}><cylinderGeometry args={[0.03, 0.03, 0.35]} /><meshStandardMaterial color="#000" /></mesh>
        ))}
    </group>
));

export const Bed = React.memo(({ x, z, rot }: any) => (
    <group position={[x, 0, z]} rotation={[0, rot, 0]}>
        <mesh position={[0, 0.3, 0]}><boxGeometry args={[1.8, 0.4, 2.2]} /><meshStandardMaterial color={COLORS.bed} roughness={0.6} /></mesh>
        <mesh position={[0, 0.05, 0]}><boxGeometry args={[1.9, 0.1, 2.3]} /><meshStandardMaterial color="#4E342E" /></mesh>
        <mesh position={[0, 0.6, -1.1]}><boxGeometry args={[1.9, 1.2, 0.1]} /><meshStandardMaterial color="#4E342E" /></mesh>
        <mesh position={[0, 0.55, -0.9]}><boxGeometry args={[1.0, 0.15, 0.4]} /><meshStandardMaterial color="#FFFFFF" /></mesh>
    </group>
));

export const KitchenCounter = React.memo(({ x, z, w, d, rot = 0 }: any) => (
    <group position={[x, 0.45, z]} rotation={[0, rot, 0]}>
        <mesh><boxGeometry args={[w, 0.9, d]} /><meshStandardMaterial color="#CFD8DC" /></mesh>
        <mesh position={[0, 0.46, 0]}><boxGeometry args={[w + 0.05, 0.04, d + 0.05]} /><meshStandardMaterial color="#212121" roughness={0.1} /></mesh>
    </group>
));

export const Barrel = ({ position }: any) => (
  <group position={position}>
      <mesh position={[0, 0.4, 0]}><cylinderGeometry args={[0.5, 0.5, 1.0, 12]} /><meshStandardMaterial color="#5D4037" /></mesh>
      <mesh position={[0, 0.8, 0]}><cylinderGeometry args={[0.51, 0.51, 0.05, 12]} /><meshStandardMaterial color="#212121" /></mesh>
      <mesh position={[0, 0.1, 0]}><cylinderGeometry args={[0.51, 0.51, 0.05, 12]} /><meshStandardMaterial color="#212121" /></mesh>
  </group>
);

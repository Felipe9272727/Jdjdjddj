# floor7_asm.s - hand-written WebAssembly assembly for Floor 7 (the pirate ship).
# Genuine WASM text/assembly, assembled by clang's integrated assembler and
# linked with the C brain (floor7.c) via wasm-ld. It provides the two hot math
# primitives the whole floor runs on: a sine polynomial and a guarded
# reciprocal length. So the sea motion, the captain's bob and the puddle
# proximity directions are all driven by hand-written assembly.

	.text

# float f7_sinp(float x) - 7th-order odd polynomial sine, expects x in [-pi,pi].
# Horner form on u = x*x:  x * (1 + u*(c1 + u*(c2 + u*c3)))
#   c1 = -1/6, c2 = 1/120, c3 = -1/5040
	.globl	f7_sinp
	.functype	f7_sinp (f32) -> (f32)
f7_sinp:
	.functype	f7_sinp (f32) -> (f32)
	.local	f32                       # local 1 = u = x*x
	local.get	0
	local.get	0
	f32.mul
	local.set	1                     # u = x*x
	f32.const	-0x1.9c8c2cp-13       # -1/5040
	local.get	1
	f32.mul
	f32.const	0x1.111112p-7         # 1/120
	f32.add
	local.get	1
	f32.mul
	f32.const	-0x1.555556p-3        # -1/6
	f32.add
	local.get	1
	f32.mul
	f32.const	0x1p0                 # 1.0
	f32.add
	local.get	0
	f32.mul
	end_function

# float f7_inv_len2(float dx, float dz) - 1/sqrt(dx*dx+dz*dz), guarded vs zero.
	.globl	f7_inv_len2
	.functype	f7_inv_len2 (f32, f32) -> (f32)
f7_inv_len2:
	.functype	f7_inv_len2 (f32, f32) -> (f32)
	.local	f32                       # local 2 = len
	local.get	0
	local.get	0
	f32.mul
	local.get	1
	local.get	1
	f32.mul
	f32.add
	f32.const	0x1p-20               # epsilon
	f32.add
	f32.sqrt
	local.set	2
	f32.const	0x1p0
	local.get	2
	f32.div
	end_function

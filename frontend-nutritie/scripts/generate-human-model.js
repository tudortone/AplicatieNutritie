const fs = require('fs');
const path = require('path');
const THREE = require('three');

if (typeof global.FileReader === 'undefined') {
  global.FileReader = class FileReader {
    readAsArrayBuffer(blob) {
      setTimeout(async () => {
        if (blob && typeof blob.arrayBuffer === 'function') {
          this.result = await blob.arrayBuffer();
        } else if (Buffer.isBuffer(blob)) {
          this.result = blob.buffer.slice(blob.byteOffset, blob.byteOffset + blob.byteLength);
        } else if (blob && blob.buffer) {
          this.result = blob.buffer;
        } else {
          this.result = blob;
        }
        if (this.onloadend) this.onloadend({ target: this });
        if (this.onload) this.onload({ target: this });
      }, 0);
    }
    readAsDataURL(blob) {
      setTimeout(async () => {
        let buf;
        if (blob && typeof blob.arrayBuffer === 'function') {
          const ab = await blob.arrayBuffer();
          buf = Buffer.from(ab);
        } else if (Buffer.isBuffer(blob)) {
          buf = blob;
        } else if (blob && blob.buffer) {
          buf = Buffer.from(blob.buffer);
        } else {
          buf = Buffer.from(blob);
        }
        this.result = 'data:application/octet-stream;base64,' + buf.toString('base64');
        if (this.onloadend) this.onloadend({ target: this });
        if (this.onload) this.onload({ target: this });
      }, 0);
    }
  };
}

const { GLTFExporter } = require('three/examples/jsm/exporters/GLTFExporter.js');

function createOrganicMesh(geometry, name, colorHex = 0x27313A) {
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(colorHex),
    roughness: 0.72,
    metalness: 0.04,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = name;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

// Creare scenă / grup principal
const bodyGroup = new THREE.Group();
bodyGroup.name = 'Human_Anatomy_Root';

// --- NON-MUSCLE CORE & JOINTS (Metallic grey #27313A) ---
// Cap
const headGeo = new THREE.SphereGeometry(0.24, 32, 32);
headGeo.scale(1, 1.25, 1.1);
const head = createOrganicMesh(headGeo, 'head');
head.position.set(0, 1.75, 0);
bodyGroup.add(head);

// Gât bază / Coloană / Core intern
const spineGeo = new THREE.CylinderGeometry(0.08, 0.1, 1.4, 16);
const spine = createOrganicMesh(spineGeo, 'spine_core');
spine.position.set(0, 0.8, -0.05);
bodyGroup.add(spine);

// Articulații (ușor închise)
const jointPositions = [
  ['shoulder_joint_l', -0.38, 1.35, 0],
  ['shoulder_joint_r', 0.38, 1.35, 0],
  ['elbow_joint_l', -0.55, 0.95, 0.03],
  ['elbow_joint_r', 0.55, 0.95, 0.03],
  ['wrist_joint_l', -0.68, 0.55, 0.08],
  ['wrist_joint_r', 0.68, 0.55, 0.08],
  ['hip_joint_l', -0.2, 0.05, 0],
  ['hip_joint_r', 0.2, 0.05, 0],
  ['knee_joint_l', -0.22, -0.45, 0.03],
  ['knee_joint_r', 0.22, -0.45, 0.03],
  ['ankle_joint_l', -0.22, -0.95, 0],
  ['ankle_joint_r', 0.22, -0.95, 0],
];
for (const [name, x, y, z] of jointPositions) {
  const jointGeo = new THREE.SphereGeometry(0.06, 16, 16);
  const joint = createOrganicMesh(jointGeo, name);
  joint.position.set(x, y, z);
  bodyGroup.add(joint);
}

// --- GRUPE MUSCULARE ANATOMICE (cu nume exacte din muscleMeshMap.ts) ---

// 1. PECTORALI (chest_l, chest_r)
const chestLGeo = new THREE.SphereGeometry(0.18, 32, 32);
chestLGeo.scale(1.15, 0.85, 0.55);
const chestL = createOrganicMesh(chestLGeo, 'chest_l');
chestL.position.set(-0.16, 1.25, 0.12);
chestL.rotation.set(0.15, 0.1, -0.1);
bodyGroup.add(chestL);

const chestRGeo = chestLGeo.clone();
const chestR = createOrganicMesh(chestRGeo, 'chest_r');
chestR.position.set(0.16, 1.25, 0.12);
chestR.rotation.set(0.15, -0.1, 0.1);
bodyGroup.add(chestR);

// 2. DELTOID ANTERIOR (front_deltoid_l, front_deltoid_r)
const frontDeltGeo = new THREE.SphereGeometry(0.11, 24, 24);
frontDeltGeo.scale(1, 1.3, 0.9);
const frontDeltL = createOrganicMesh(frontDeltGeo, 'front_deltoid_l');
frontDeltL.position.set(-0.35, 1.36, 0.08);
frontDeltL.rotation.set(0.2, 0, -0.3);
bodyGroup.add(frontDeltL);

const frontDeltR = createOrganicMesh(frontDeltGeo.clone(), 'front_deltoid_r');
frontDeltR.position.set(0.35, 1.36, 0.08);
frontDeltR.rotation.set(0.2, 0, 0.3);
bodyGroup.add(frontDeltR);

// 3. DELTOID LATERAL (side_deltoid_l, side_deltoid_r)
const sideDeltGeo = new THREE.SphereGeometry(0.12, 24, 24);
sideDeltGeo.scale(0.9, 1.35, 0.9);
const sideDeltL = createOrganicMesh(sideDeltGeo, 'side_deltoid_l');
sideDeltL.position.set(-0.43, 1.36, 0);
sideDeltL.rotation.set(0, 0, -0.25);
bodyGroup.add(sideDeltL);

const sideDeltR = createOrganicMesh(sideDeltGeo.clone(), 'side_deltoid_r');
sideDeltR.position.set(0.43, 1.36, 0);
sideDeltR.rotation.set(0, 0, 0.25);
bodyGroup.add(sideDeltR);

// 4. DELTOID POSTERIOR (rear_deltoid_l, rear_deltoid_r)
const rearDeltGeo = new THREE.SphereGeometry(0.11, 24, 24);
rearDeltGeo.scale(1, 1.3, 0.85);
const rearDeltL = createOrganicMesh(rearDeltGeo, 'rear_deltoid_l');
rearDeltL.position.set(-0.35, 1.36, -0.08);
rearDeltL.rotation.set(-0.2, 0, -0.3);
bodyGroup.add(rearDeltL);

const rearDeltR = createOrganicMesh(rearDeltGeo.clone(), 'rear_deltoid_r');
rearDeltR.position.set(0.35, 1.36, -0.08);
rearDeltR.rotation.set(-0.2, 0, 0.3);
bodyGroup.add(rearDeltR);

// 5. BICEPS (biceps_l, biceps_r)
const bicepsGeo = new THREE.CapsuleGeometry(0.075, 0.22, 16, 16);
const bicepsL = createOrganicMesh(bicepsGeo, 'biceps_l');
bicepsL.position.set(-0.46, 1.15, 0.05);
bicepsL.rotation.set(0.1, 0, -0.35);
bodyGroup.add(bicepsL);

const bicepsR = createOrganicMesh(bicepsGeo.clone(), 'biceps_r');
bicepsR.position.set(0.46, 1.15, 0.05);
bicepsR.rotation.set(0.1, 0, 0.35);
bodyGroup.add(bicepsR);

// 6. TRICEPS (triceps_l, triceps_r)
const tricepsGeo = new THREE.CapsuleGeometry(0.08, 0.24, 16, 16);
const tricepsL = createOrganicMesh(tricepsGeo, 'triceps_l');
tricepsL.position.set(-0.46, 1.15, -0.06);
tricepsL.rotation.set(-0.1, 0, -0.35);
bodyGroup.add(tricepsL);

const tricepsR = createOrganicMesh(tricepsGeo.clone(), 'triceps_r');
tricepsR.position.set(0.46, 1.15, -0.06);
tricepsR.rotation.set(-0.1, 0, 0.35);
bodyGroup.add(tricepsR);

// 7. ANTEBRAȚE (forearm_l, forearm_r)
const forearmGeo = new THREE.CapsuleGeometry(0.065, 0.26, 16, 16);
const forearmL = createOrganicMesh(forearmGeo, 'forearm_l');
forearmL.position.set(-0.62, 0.76, 0.06);
forearmL.rotation.set(0.15, 0, -0.3);
bodyGroup.add(forearmL);

const forearmR = createOrganicMesh(forearmGeo.clone(), 'forearm_r');
forearmR.position.set(0.62, 0.76, 0.06);
forearmR.rotation.set(0.15, 0, 0.3);
bodyGroup.add(forearmR);

// 8. ABDOMEN (abs)
const absGeo = new THREE.BoxGeometry(0.26, 0.42, 0.12, 4, 6, 2);
// Rotunjire blândă
const pos = absGeo.attributes.position;
for (let i = 0; i < pos.count; i++) {
  const z = pos.getZ(i);
  if (z > 0) pos.setZ(i, z + Math.cos(pos.getY(i) * 3) * 0.03);
}
absGeo.computeVertexNormals();
const abs = createOrganicMesh(absGeo, 'abs');
abs.position.set(0, 0.85, 0.1);
bodyGroup.add(abs);

// 9. OBLICI (oblique_l, oblique_r)
const obliqueGeo = new THREE.CapsuleGeometry(0.07, 0.28, 16, 16);
const obliqueL = createOrganicMesh(obliqueGeo, 'oblique_l');
obliqueL.position.set(-0.18, 0.85, 0.06);
obliqueL.rotation.set(0, 0.2, 0.2);
bodyGroup.add(obliqueL);

const obliqueR = createOrganicMesh(obliqueGeo.clone(), 'oblique_r');
obliqueR.position.set(0.18, 0.85, 0.06);
obliqueR.rotation.set(0, -0.2, -0.2);
bodyGroup.add(obliqueR);

// 10. TRAPEZ (trapezius)
const trapsGeo = new THREE.BoxGeometry(0.45, 0.22, 0.14, 8, 4, 4);
const tPos = trapsGeo.attributes.position;
for (let i = 0; i < tPos.count; i++) {
  if (tPos.getY(i) > 0) tPos.setX(i, tPos.getX(i) * 0.6);
}
trapsGeo.computeVertexNormals();
const traps = createOrganicMesh(trapsGeo, 'trapezius');
traps.position.set(0, 1.42, -0.06);
bodyGroup.add(traps);

// 11. DORSALI / LATS (lats_l, lats_r)
const latsGeo = new THREE.SphereGeometry(0.18, 24, 24);
latsGeo.scale(0.8, 1.4, 0.6);
const latsL = createOrganicMesh(latsGeo, 'lats_l');
latsL.position.set(-0.2, 1.08, -0.1);
latsL.rotation.set(-0.15, 0.3, 0.25);
bodyGroup.add(latsL);

const latsR = createOrganicMesh(latsGeo.clone(), 'lats_r');
latsR.position.set(0.2, 1.08, -0.1);
latsR.rotation.set(-0.15, -0.3, -0.25);
bodyGroup.add(latsR);

// 12. ROMBOIZI & LOMBARI (rhomboids, lower_back)
const rhombGeo = new THREE.BoxGeometry(0.28, 0.25, 0.1, 4, 4, 2);
const rhomb = createOrganicMesh(rhombGeo, 'rhomboids');
rhomb.position.set(0, 1.18, -0.12);
bodyGroup.add(rhomb);

const lowerBackGeo = new THREE.BoxGeometry(0.24, 0.3, 0.1, 4, 4, 2);
const lowerBack = createOrganicMesh(lowerBackGeo, 'lower_back');
lowerBack.position.set(0, 0.78, -0.11);
bodyGroup.add(lowerBack);

// 13. FESIERI (glutes_l, glutes_r)
const gluteGeo = new THREE.SphereGeometry(0.15, 24, 24);
gluteGeo.scale(1.0, 1.1, 0.9);
const gluteL = createOrganicMesh(gluteGeo, 'glutes_l');
gluteL.position.set(-0.14, 0.45, -0.1);
gluteL.rotation.set(-0.2, 0.1, 0.1);
bodyGroup.add(gluteL);

const gluteR = createOrganicMesh(gluteGeo.clone(), 'glutes_r');
gluteR.position.set(0.14, 0.45, -0.1);
gluteR.rotation.set(-0.2, -0.1, -0.1);
bodyGroup.add(gluteR);

// 14. CVADRICEPS (quads_l, quads_r)
const quadsGeo = new THREE.CapsuleGeometry(0.1, 0.35, 24, 24);
const quadsL = createOrganicMesh(quadsGeo, 'quads_l');
quadsL.position.set(-0.2, 0.18, 0.05);
quadsL.rotation.set(0.05, 0, 0.06);
bodyGroup.add(quadsL);

const quadsR = createOrganicMesh(quadsGeo.clone(), 'quads_r');
quadsR.position.set(0.2, 0.18, 0.05);
quadsR.rotation.set(0.05, 0, -0.06);
bodyGroup.add(quadsR);

// 15. ISCHIOGAMBIERI / HAMSTRINGS (hamstrings_l, hamstrings_r)
const hamGeo = new THREE.CapsuleGeometry(0.095, 0.35, 24, 24);
const hamL = createOrganicMesh(hamGeo, 'hamstrings_l');
hamL.position.set(-0.2, 0.18, -0.06);
hamL.rotation.set(-0.05, 0, 0.06);
bodyGroup.add(hamL);

const hamR = createOrganicMesh(hamGeo.clone(), 'hamstrings_r');
hamR.position.set(0.2, 0.18, -0.06);
hamR.rotation.set(-0.05, 0, -0.06);
bodyGroup.add(hamR);

// 16. ADDUCTORI (adductors_l, adductors_r)
const addGeo = new THREE.CapsuleGeometry(0.06, 0.3, 16, 16);
const addL = createOrganicMesh(addGeo, 'adductors_l');
addL.position.set(-0.09, 0.18, 0.01);
addL.rotation.set(0, 0, -0.15);
bodyGroup.add(addL);

const addR = createOrganicMesh(addGeo.clone(), 'adductors_r');
addR.position.set(0.09, 0.18, 0.01);
addR.rotation.set(0, 0, 0.15);
bodyGroup.add(addR);

// 17. GAMBE / CALVES (calves_l, calves_r)
const calfGeo = new THREE.CapsuleGeometry(0.075, 0.32, 24, 24);
const calfL = createOrganicMesh(calfGeo, 'calves_l');
calfL.position.set(-0.22, -0.7, -0.03);
bodyGroup.add(calfL);

const calfR = createOrganicMesh(calfGeo.clone(), 'calves_r');
calfR.position.set(0.22, -0.7, -0.03);
bodyGroup.add(calfR);

// Tălpi
const footGeo = new THREE.BoxGeometry(0.12, 0.08, 0.22, 4, 4, 4);
const footL = createOrganicMesh(footGeo, 'foot_l');
footL.position.set(-0.22, -1.0, 0.05);
bodyGroup.add(footL);

const footR = createOrganicMesh(footGeo.clone(), 'foot_r');
footR.position.set(0.22, -1.0, 0.05);
bodyGroup.add(footR);

// --- EXPORT GLTF BINARY (.glb) ---
const exporter = new GLTFExporter();
exporter.parse(
  bodyGroup,
  (gltfBuffer) => {
    const outPathHuman = path.join(__dirname, '../assets/models/human_model.glb');
    const outPathRealistic = path.join(__dirname, '../assets/models/realistic_anatomy.glb');
    const buf = Buffer.from(gltfBuffer);
    fs.writeFileSync(outPathHuman, buf);
    fs.writeFileSync(outPathRealistic, buf);
    console.log('✅ Generated procedural anatomic models at:', outPathHuman, 'and', outPathRealistic);
    console.log('Size:', (buf.byteLength / 1024).toFixed(2), 'KB');
  },
  (err) => {
    console.error('❌ Error exporting GLTF:', err);
  },
  { binary: true }
);

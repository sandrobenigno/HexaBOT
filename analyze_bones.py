import struct
import json
import numpy as np

def analyze(path):
    print("========================================")
    print("ANALYSIS FOR:", path)
    print("========================================")
    with open(path, 'rb') as f:
        magic, ver, length = struct.unpack('<III', f.read(12))
        chunk_len, chunk_type = struct.unpack('<II', f.read(8))
        gltf = json.loads(f.read(chunk_len))
        
        nodes = gltf.get('nodes', [])
        meshes = gltf.get('meshes', [])
        accessors = gltf.get('accessors', [])
        
        for i, n in enumerate(nodes):
            name = n.get('name', '')
            if name.startswith('D0') or name.startswith('E0'):
                t0 = np.array(n.get('translation', [0,0,0]))
                ch1 = n.get('children', [])
                if ch1:
                    j1 = nodes[ch1[0]]
                    t1 = np.array(j1.get('translation', [0,0,0]))
                    ch2 = j1.get('children', [])
                    if ch2:
                        j2 = nodes[ch2[0]]
                        t2 = np.array(j2.get('translation', [0,0,0]))
                        ch3 = j2.get('children', [])
                        if ch3:
                            j3 = nodes[ch3[0]]
                            t3 = np.array(j3.get('translation', [0,0,0]))
                            
                            # Mesh of J3 (tibia)
                            m3_idx = j3.get('mesh')
                            m3_bounds = None
                            if m3_idx is not None:
                                p_idx = meshes[m3_idx]['primitives'][0]['attributes'].get('POSITION')
                                acc = accessors[p_idx]
                                m3_bounds = (acc.get('min'), acc.get('max'))
                                
                            print(f"Socket: {name:<8} pos={t0} (scaled /100: {t0*0.01})")
                            print(f"  -> J1 (Coxa):  pos={t1}")
                            print(f"  -> J2 (Femur): pos={t2}, |t2|={np.linalg.norm(t2):.4f} (scaled /100: {np.linalg.norm(t2)*0.01:.4f}m)")
                            print(f"  -> J3 (Tibia): pos={t3}, |t3|={np.linalg.norm(t3):.4f} (scaled /100: {np.linalg.norm(t3)*0.01:.4f}m)")
                            if m3_bounds:
                                print(f"  -> J3 Mesh Bounds: min={m3_bounds[0]}, max={m3_bounds[1]}")
                                print(f"     Tibia length (max.x * 0.01) = {m3_bounds[1][0]*0.01:.4f}m")

if __name__ == '__main__':
    analyze('glb/aranha.glb')
    analyze('glb/aranha_pernalonga.glb')

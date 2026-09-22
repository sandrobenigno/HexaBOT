import struct
import json
import numpy as np

def inspect_glb(path):
    print("========================================")
    print("INSPECTING:", path)
    print("========================================")
    with open(path, 'rb') as f:
        magic, ver, length = struct.unpack('<III', f.read(12))
        chunk_len, chunk_type = struct.unpack('<II', f.read(8))
        gltf = json.loads(f.read(chunk_len))
        bin_len, bin_type = struct.unpack('<II', f.read(8))
        bin_data = f.read(bin_len)
        
        nodes = gltf.get('nodes', [])
        meshes = gltf.get('meshes', [])
        accessors = gltf.get('accessors', [])
        buffer_views = gltf.get('bufferViews', [])
        
        for i, n in enumerate(nodes):
            name = n.get('name', '')
            trans = n.get('translation', [0, 0, 0])
            rot = n.get('rotation', [0, 0, 0, 1])
            children = n.get('children', [])
            mesh_idx = n.get('mesh')
            
            mesh_info = ""
            if mesh_idx is not None:
                mesh = meshes[mesh_idx]
                prims = mesh.get('primitives', [])
                for p in prims:
                    pos_idx = p.get('attributes', {}).get('POSITION')
                    if pos_idx is not None:
                        acc = accessors[pos_idx]
                        min_v = acc.get('min')
                        max_v = acc.get('max')
                        mesh_info += f" pos_min={min_v} pos_max={max_v}"
                        
            print(f"Node {i:2d}: {name:<35} | trans={trans} | children={children} | mesh={mesh_idx}{mesh_info}")

if __name__ == '__main__':
    inspect_glb('glb/aranha.glb')
    inspect_glb('glb/aranha_pernalonga.glb')

import numpy as np

def solve_ik_test(L1, L2, L3, bodyY, targetX, targetZ, coxaElevationDeg=35.0):
    P0 = np.array([0.0, bodyY, 0.0]) # relative to socket
    target = np.array([targetX, 0.0, targetZ])
    vTarget = target - P0
    
    # planar direction
    dirH = np.array([vTarget[0], 0.0, vTarget[2]])
    distH = np.linalg.norm(dirH)
    dirH = dirH / distH
    
    elevRad = np.radians(coxaElevationDeg)
    P1 = P0 + dirH * (L1 * np.cos(elevRad)) + np.array([0, L1 * np.sin(elevRad), 0])
    
    vReach = target - P1
    D = np.linalg.norm(vReach)
    
    # law of cosines for femur & tibia
    cosKnee = (L2**2 + L3**2 - D**2) / (2 * L2 * L3)
    cosKnee = np.clip(cosKnee, -1.0, 1.0)
    kneeAngle = np.arccos(cosKnee)
    
    cosFemur = (L2**2 + D**2 - L3**2) / (2 * L2 * D)
    cosFemur = np.clip(cosFemur, -1.0, 1.0)
    femurOffsetAngle = np.arccos(cosFemur)
    
    print(f"L1={L1:.2f}, L2={L2:.2f}, L3={L3:.2f}, bodyY={bodyY:.2f}")
    print(f"Target dist={np.linalg.norm(target):.2f}, D={D:.2f}, max reach={L2+L3:.2f}")
    print(f"Knee angle={np.degrees(kneeAngle):.1f} deg, Femur angle={np.degrees(femurOffsetAngle):.1f} deg")

print("--- HX1 (Classic) ---")
solve_ik_test(2.3608, 2.1611, 2.8000, 1.70, 5.8 * 1.10, 3.2 * 1.10)

print("\n--- HX2 (Pernalonga) with L3=5.60 (OLD WRONG) ---")
solve_ik_test(3.3132, 2.7678, 5.6000, 2.40, 5.8 * 1.337 * 1.10, 3.2 * 1.337 * 1.10)

print("\n--- HX2 (Pernalonga) with L3=3.75 (NEW CORRECT) ---")
solve_ik_test(3.3132, 2.7678, 3.7500, 2.40, 5.8 * 1.337 * 1.10, 3.2 * 1.337 * 1.10)

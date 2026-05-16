import argparse
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def union_radius(theta: float, core_radius: float, rib_radius: float, ribs: int) -> float:
    radius = core_radius
    center_radius = core_radius
    for i in range(ribs):
        a = (i / ribs) * math.tau
        delta = math.atan2(math.sin(theta - a), math.cos(theta - a))
        lateral = abs(center_radius * math.sin(delta))
        if lateral > rib_radius:
            continue
        candidate = center_radius * math.cos(delta) + math.sqrt(rib_radius * rib_radius - lateral * lateral)
        radius = max(radius, candidate)
    return radius


def make_profile(core_radius: float, rib_radius: float, ribs: int, samples: int) -> list[tuple[float, float]]:
    return [
        (
            union_radius((i / samples) * math.tau, core_radius, rib_radius, ribs)
            * math.cos((i / samples) * math.tau),
            union_radius((i / samples) * math.tau, core_radius, rib_radius, ribs)
            * math.sin((i / samples) * math.tau),
        )
        for i in range(samples)
    ]


def make_extruded_mesh(name: str, profile: list[tuple[float, float]], height: float) -> bpy.types.Mesh:
    verts: list[tuple[float, float, float]] = []
    faces: list[tuple[int, ...]] = []
    count = len(profile)

    for z in (0.0, height):
        for x, y in profile:
            verts.append((x, y, z))

    for i in range(count):
        j = (i + 1) % count
        faces.append((i, j, count + j, count + i))

    faces.append(tuple(reversed(range(count))))
    faces.append(tuple(range(count, count * 2)))

    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    return mesh


def make_marble_material() -> bpy.types.Material:
    mat = bpy.data.materials.new("candoglia_stylized_marble")
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (0.72, 0.66, 0.62, 1.0)
        bsdf.inputs["Roughness"].default_value = 0.74
        bsdf.inputs["Metallic"].default_value = 0.0
    return mat


def add_vertical_marble_lines(obj: bpy.types.Object, core_radius: float, height: float, ribs: int) -> None:
    dark = make_marble_material()
    dark.name = "candoglia_subtle_vertical_vein"
    bsdf = dark.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (0.48, 0.45, 0.44, 1.0)
        bsdf.inputs["Roughness"].default_value = 0.82

    for i in range(ribs):
        a = (i / ribs) * math.tau + math.radians(7)
        curve = bpy.data.curves.new(f"vein_{i:02d}", "CURVE")
        curve.dimensions = "3D"
        curve.resolution_u = 2
        curve.bevel_depth = 0.012
        curve.bevel_resolution = 2
        spline = curve.splines.new("POLY")
        spline.points.add(3)
        for p, z in zip(spline.points, (0.15, height * 0.33, height * 0.66, height - 0.2)):
            wobble = math.sin(z * 1.7 + i) * 0.035
            radius = core_radius * 1.13
            p.co = (
                math.cos(a + wobble) * radius,
                math.sin(a + wobble) * radius,
                z,
                1.0,
            )
        vein = bpy.data.objects.new(curve.name, curve)
        bpy.context.collection.objects.link(vein)
        vein.data.materials.append(dark)
        vein.parent = obj


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", required=True)
    parser.add_argument("--height", type=float, default=24.0)
    parser.add_argument("--core-radius", type=float, default=1.35)
    parser.add_argument("--rib-ratio", type=float, default=1 / 6)
    parser.add_argument("--ribs", type=int, default=8)
    parser.add_argument("--samples", type=int, default=256)
    script_args = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    args = parser.parse_args(script_args)

    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete()

    rib_radius = args.core_radius * args.rib_ratio
    profile = make_profile(args.core_radius, rib_radius, args.ribs, args.samples)
    mesh = make_extruded_mesh("milan_duomo_pillar_shaft_mesh", profile, args.height)
    obj = bpy.data.objects.new("milan_duomo_pillar_shaft", mesh)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(make_marble_material())
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)

    bpy.ops.object.shade_smooth()
    bevel = obj.modifiers.new("soft_polystyle_edges", "BEVEL")
    bevel.width = 0.035
    bevel.segments = 3
    bevel.affect = "EDGES"

    weighted = obj.modifiers.new("weighted_normals", "WEIGHTED_NORMAL")
    weighted.keep_sharp = True

    add_vertical_marble_lines(obj, args.core_radius, args.height, args.ribs)

    bpy.ops.object.empty_add(type="PLAIN_AXES", location=(0, 0, 0))
    root = bpy.context.object
    root.name = "asset_origin_floor_center"
    obj.parent = root

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=str(out),
        export_format="GLB",
        export_yup=True,
        use_selection=False,
        export_apply=True,
    )


if __name__ == "__main__":
    main()

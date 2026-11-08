"""Lossless sprite export hygiene shared by Blender and standalone packaging.
Pixels with zero alpha carry no visible color; zero their hidden RGB so Cycles
camera-invisible geometry does not bloat PNGs with unused noisy RGB samples.
"""
from pathlib import Path
from PIL import Image

def normalize_transparent_rgb(image):
    image=image.convert('RGBA')
    image.putdata([(0,0,0,0) if pixel[3]==0 else pixel for pixel in image.getdata()])
    return image

if __name__=='__main__':
    import argparse
    parser=argparse.ArgumentParser();parser.add_argument('--normalize-directory',type=Path,required=True)
    args=parser.parse_args()
    for path in sorted(args.normalize_directory.glob('*.png')):
        before=path.stat().st_size
        normalize_transparent_rgb(Image.open(path)).save(path,optimize=True)
        print(f'{path.name}: {before} -> {path.stat().st_size} bytes')

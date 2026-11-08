from PIL import Image, ImageDraw
from pathlib import Path
import hashlib, json, shutil, subprocess, tempfile

OUT=Path('game/art/tree-sprites');OUT.mkdir(parents=True,exist_ok=True)
TMP=Path(tempfile.mkdtemp(prefix='clareira-uv-trees-'))
tile=16
palettes=[]
broadleaf=[
 ['#543f2e','#254a36','#39764b','#68a552'],['#55422d','#31543c','#668047','#9aaa59'],
 ['#514033','#314f39','#4f7950','#8eaa62'],['#54402d','#3e603c','#72914a','#aac065'],
 ['#4b4033','#315842','#4c8054','#82a95e'],['#514134','#3c613e','#64864b','#9bb462'],
 ['#503d32','#294b37','#4d744c','#7fa554']]
for row in range(14):
 base=broadleaf[row//2]
 if row%2:base=['#493a30','#70472d','#a45f32','#e19a49']
 palettes.append(base)
palettes.append(['#4e4335','#244536','#386b45','#679755'])
atlas=Image.new('RGBA',(tile*4,tile*15),(0,0,0,0))
for row,palette in enumerate(palettes):
 for col,color in enumerate(palette):
  x0=col*tile;y0=row*tile
  ImageDraw.Draw(atlas).rectangle((x0,y0,x0+tile-1,y0+tile-1),fill=color)
  d=ImageDraw.Draw(atlas)
  if col==0: # bark grooves
   for x in (3,7,12):d.line((x0+x,y0+1,x0+x-1,y0+14),fill='#342b24',width=1)
   d.point((x0+9,y0+5),fill='#d0a165')
  else: # foliage clustered highlights and pixel cut-outs
   d.rectangle((x0+2,y0+3,x0+5,y0+5),fill=palette[min(3,col+1)])
   d.rectangle((x0+10,y0+8,x0+13,y0+11),fill=palette[max(0,col-1)])
   d.point((x0+7,y0+12),fill=palette[min(3,col+1)])
atlas_path=OUT/'tree-material-uv-v1.png';atlas.save(atlas_path,optimize=True)
subprocess.run(['blender','-b','--python','scripts/blender/render-uv-tree-models.py','--',str(TMP.resolve()),str(atlas_path.resolve())],check=True)

def pack(kind,rows,path):
 image=Image.new('RGBA',(80*9,104*rows),(0,0,0,0))
 for row in range(rows):
  for frame in range(9):
   source=TMP/f'{kind}-{row:02d}-{frame:02d}.png'
   image.alpha_composite(Image.open(source).convert('RGBA'),(frame*80,row*104))
 image.save(path,optimize=True)
 return image
broad=pack('broadleaf',14,OUT/'broadleaf-frames.png')
pine=pack('pine',1,OUT/'pine-frames.png')
shutil.copy2(TMP/'tree-uv-catalog-v1.blend',OUT/'tree-uv-catalog-v1.blend')
# Direction-labeled, nearest-neighbor review image for all species/palette rows.
review=Image.new('RGBA',(80*9,104*15),(27,30,31,255))
review.alpha_composite(broad,(0,0));review.alpha_composite(pine,(0,104*14))
review.save(OUT/'uv-tree-contact-sheet.png',optimize=True)
manifest={
 'format':'png-atlas','source':'Blender UV-mapped low-poly tree catalog; frames rendered from articulated crown meshes',
 'uvMaterialAtlas':{'file':'tree-material-uv-v1.png','tileSize':16,'columns':['bark','deep-leaf','leaf','sunlit-leaf'],'paletteRows':15},
 'cell':{'width':80,'height':104},'framesPerRow':9,'frameCount':9,
 'playback':{'mode':'mesh-wind-cycle','cycleSeconds':14,'activeWindow':.28,'framePhases':[None,0,.04,.08,.12,.16,.2,.24,.28],
  'anchor':{'x':40,'y':100},'smoothing':'nearest-neighbor'},
 'atlases':{'broadleaf':{'file':'broadleaf-frames.png','variants':7,'warmRows':2,'rows':14},'pine':{'file':'pine-frames.png','variants':1,'rows':1}},
 'sourceModel':'tree-uv-catalog-v1.blend','materialAtlasSha256':hashlib.sha256(atlas_path.read_bytes()).hexdigest(),
}
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps({'broadleaf':list(broad.size),'pine':list(pine.size),'output':str(OUT)}))

// 预置专业色板体系：复古硬件与真实物理手工色号 (Perler Beads & DMC)
export interface PaletteColor {
  name: string;
  hex: string;
  rgb: [number, number, number];
  code?: string; // 拼豆或绣线编号
}

export interface Palette {
  id: string;
  name: string;
  category: 'retro' | 'craft' | 'game';
  colors: PaletteColor[];
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const num = parseInt(clean, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

export const PALETTES: Palette[] = [
  {
    id: 'original',
    name: 'Full Color (No Palette)',
    category: 'retro',
    colors: []
  },
  {
    id: 'gameboy',
    name: 'Game Boy (Original 4-Color)',
    category: 'retro',
    colors: [
      { name: 'Lightest Green', hex: '#9bbc0f', rgb: hexToRgb('#9bbc0f') },
      { name: 'Light Green', hex: '#8bac0f', rgb: hexToRgb('#8bac0f') },
      { name: 'Dark Green', hex: '#306230', rgb: hexToRgb('#306230') },
      { name: 'Darkest Green', hex: '#0f380f', rgb: hexToRgb('#0f380f') }
    ]
  },
  {
    id: 'pico8',
    name: 'PICO-8 (16 Colors)',
    category: 'retro',
    colors: [
      { name: 'Black', hex: '#000000', rgb: hexToRgb('#000000') },
      { name: 'Dark Blue', hex: '#1D2B53', rgb: hexToRgb('#1D2B53') },
      { name: 'Dark Purple', hex: '#7E2553', rgb: hexToRgb('#7E2553') },
      { name: 'Dark Green', hex: '#008751', rgb: hexToRgb('#008751') },
      { name: 'Brown', hex: '#AB5236', rgb: hexToRgb('#AB5236') },
      { name: 'Dark Gray', hex: '#5F574F', rgb: hexToRgb('#5F574F') },
      { name: 'Light Gray', hex: '#C2C3C7', rgb: hexToRgb('#C2C3C7') },
      { name: 'White', hex: '#FFF1E8', rgb: hexToRgb('#FFF1E8') },
      { name: 'Red', hex: '#FF004D', rgb: hexToRgb('#FF004D') },
      { name: 'Orange', hex: '#FFA300', rgb: hexToRgb('#FFA300') },
      { name: 'Yellow', hex: '#FFEC27', rgb: hexToRgb('#FFEC27') },
      { name: 'Green', hex: '#00E436', rgb: hexToRgb('#00E436') },
      { name: 'Blue', hex: '#29ADFF', rgb: hexToRgb('#29ADFF') },
      { name: 'Indigo', hex: '#83769C', rgb: hexToRgb('#83769C') },
      { name: 'Pink', hex: '#FF77A8', rgb: hexToRgb('#FF77A8') },
      { name: 'Peach', hex: '#FFCCAA', rgb: hexToRgb('#FFCCAA') }
    ]
  },
  {
    id: 'perler',
    name: 'Perler Beads (Official Beads & BOM)',
    category: 'craft',
    colors: [
      { name: 'White', code: 'P01', hex: '#FFFFFF', rgb: hexToRgb('#FFFFFF') },
      { name: 'Black', code: 'P18', hex: '#000000', rgb: hexToRgb('#000000') },
      { name: 'Red', code: 'P05', hex: '#B81424', rgb: hexToRgb('#B81424') },
      { name: 'Orange', code: 'P04', hex: '#E75825', rgb: hexToRgb('#E75825') },
      { name: 'Cheddar', code: 'P57', hex: '#F08D1E', rgb: hexToRgb('#F08D1E') },
      { name: 'Yellow', code: 'P03', hex: '#F6CD26', rgb: hexToRgb('#F6CD26') },
      { name: 'Kiwi Lime', code: 'P61', hex: '#7EBA32', rgb: hexToRgb('#7EBA32') },
      { name: 'Dark Green', code: 'P10', hex: '#165731', rgb: hexToRgb('#165731') },
      { name: 'Pastel Blue', code: 'P52', hex: '#87BEE0', rgb: hexToRgb('#87BEE0') },
      { name: 'Light Blue', code: 'P09', hex: '#277CB5', rgb: hexToRgb('#277CB5') },
      { name: 'Dark Blue', code: 'P08', hex: '#173669', rgb: hexToRgb('#173669') },
      { name: 'Purple', code: 'P07', hex: '#582E79', rgb: hexToRgb('#582E79') },
      { name: 'Bubblegum', code: 'P56', hex: '#DD638B', rgb: hexToRgb('#DD638B') },
      { name: 'Brown', code: 'P12', hex: '#553424', rgb: hexToRgb('#553424') },
      { name: 'Light Brown', code: 'P21', hex: '#9E643F', rgb: hexToRgb('#9E643F') },
      { name: 'Sand', code: 'P70', hex: '#CEAF89', rgb: hexToRgb('#CEAF89') },
      { name: 'Grey', code: 'P17', hex: '#777A7C', rgb: hexToRgb('#777A7C') },
      { name: 'Charcoal', code: 'P71', hex: '#3B3D3E', rgb: hexToRgb('#3B3D3E') }
    ]
  },
  {
    id: 'minecraft',
    name: 'Minecraft Blocks (Texture Palette)',
    category: 'game',
    colors: [
      { name: 'Obsidian / Bedrock', code: 'BLK-01', hex: '#111015', rgb: hexToRgb('#111015') },
      { name: 'Cobblestone', code: 'BLK-02', hex: '#6D6D6D', rgb: hexToRgb('#6D6D6D') },
      { name: 'Stone / Iron Block', code: 'BLK-03', hex: '#A2A2A2', rgb: hexToRgb('#A2A2A2') },
      { name: 'Snow / Quartz', code: 'BLK-04', hex: '#EDEDED', rgb: hexToRgb('#EDEDED') },
      { name: 'Dirt / Wood Planks', code: 'BLK-05', hex: '#866043', rgb: hexToRgb('#866043') },
      { name: 'Oak Log / Spruce Wood', code: 'BLK-06', hex: '#4B341B', rgb: hexToRgb('#4B341B') },
      { name: 'Sand / Sandstone', code: 'BLK-07', hex: '#DBD3A0', rgb: hexToRgb('#DBD3A0') },
      { name: 'Oak Leaves / Grass Block', code: 'BLK-08', hex: '#4C6E28', rgb: hexToRgb('#4C6E28') },
      { name: 'Cactus / Emerald', code: 'BLK-09', hex: '#008323', rgb: hexToRgb('#008323') },
      { name: 'Water / Lapis Lazuli', code: 'BLK-10', hex: '#1F3C88', rgb: hexToRgb('#1F3C88') },
      { name: 'Diamond Block', code: 'BLK-11', hex: '#5DECF5', rgb: hexToRgb('#5DECF5') },
      { name: 'Redstone / Netherrack', code: 'BLK-12', hex: '#872322', rgb: hexToRgb('#872322') },
      { name: 'Gold Block / Terracotta', code: 'BLK-13', hex: '#E5A93B', rgb: hexToRgb('#E5A93B') }
    ]
  }
];

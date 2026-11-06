import { PixelStudio } from '@/components/blocks/pixel-studio';
import { seo } from '@/lib/seo';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/pixel-converter-with-grid/')({
  head: () => {
    return seo('/pixel-converter-with-grid', {
      title: 'Pixel Art Converter with Grid (Beads & Cross Stitch Patterns) | PixelForge',
      description: 'Free online image to pixel art converter with high-contrast coordinate grid lines and Perler bead / DMC embroidery color palette matching.'
    });
  },
  component: () => (
    <PixelStudio
      title="Pixel Art Converter with Grid"
      subtitle="Designed specifically for Perler beads, cross stitch, and physical craft patterns. Includes coordinate grid overlays and BOM material quantity calculation."
      initialResolution={32}
      initialPalette="perler"
      defaultShowGrid={true}
      pageMode="grid-beads"
    />
  ),
});

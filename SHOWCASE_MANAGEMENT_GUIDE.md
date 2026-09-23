# Category Showcase Management Guide

## Overview
This guide explains how to manage the category showcase section on the homepage through the admin panel. The showcase section displays product categories with images, titles, subtitles, and descriptions in an attractive card layout.

## Features
- **Full Admin Control**: Add, edit, delete, and reorder showcase cards
- **Image Upload**: Upload images with automatic compression and optimization
- **Real-time Updates**: Changes appear instantly on the homepage
- **Status Control**: Toggle cards between active and inactive states
- **Custom Content**: Fully customizable titles, subtitles, descriptions, and CTAs

## Accessing Showcase Management

1. Navigate to the admin panel: `/admin`
2. Click on **"Showcases"** in the sidebar navigation
3. You'll see the Showcase Management page

## Adding a New Showcase

1. Click the **"Add Showcase"** button
2. Fill in the required fields:
   - **Image**: Upload a product/category image (recommended: 800x1000px)
   - **Title**: Main heading (e.g., "One-Of-A-Kinds")
   - **Subtitle**: Category label (e.g., "RINGS")
   - **Description**: Brief description (shown on hover/tap)
   - **CTA Text**: Call-to-action button text (default: "See More Products")
   - **Display Order**: Position in the grid (1, 2, 3, 4...)
   - **Status**: Active or Inactive

3. Click **"Create Showcase"** to save

## Editing a Showcase

1. Find the showcase card you want to edit
2. Click the **edit icon** (pencil button)
3. Modify the fields as needed
4. To change the image, upload a new one
5. Click **"Update Showcase"** to save changes

## Deleting a Showcase

1. Find the showcase card you want to delete
2. Click the **delete icon** (trash button)
3. Confirm the deletion
4. The image and data will be permanently removed

## Display Order

The **Display Order** field controls the position of showcase cards:
- Order 1: First position (top-left on desktop)
- Order 2: Second position
- Order 3: Third position
- Order 4: Fourth position (top-right on desktop)

Lower numbers appear first. You can set any number, and cards will be sorted accordingly.

## Status Management

- **Active**: Card is visible on the homepage
- **Inactive**: Card is hidden from the homepage (but not deleted)

Use inactive status for:
- Seasonal content you want to hide temporarily
- Testing new showcases before making them live
- Keeping backup content

## Image Guidelines

### Recommended Specifications
- **Aspect Ratio**: 4:5 (portrait orientation)
- **Dimensions**: 800x1000 pixels
- **Format**: JPG, PNG, or WebP
- **File Size**: Up to 10MB (will be compressed automatically)

### Image Tips
- Use high-quality product photography
- Ensure good lighting and clear focus
- Text/labels will be overlaid on the bottom portion
- Darker areas at the bottom work better for text readability
- Avoid complex backgrounds that might interfere with text

## Layout & Display

### Desktop Layout
- 4 cards displayed in a single row
- Cards expand on hover to show description and CTA
- Smooth animations and transitions

### Mobile Layout
- 2x2 grid (2 cards per row)
- Tap to expand and view description and CTA
- Tap again or tap another card to collapse

## Best Practices

1. **Keep Titles Short**: 2-4 words work best
2. **Subtitles in Caps**: Traditional format for category labels
3. **Concise Descriptions**: One sentence is ideal (shown on hover)
4. **Consistent CTA**: Use the same CTA text across all cards
5. **Maintain 4 Cards**: The layout is optimized for 4 showcases
6. **Regular Updates**: Refresh images seasonally to keep content fresh

## Firebase Integration

All showcase data is stored in Firebase:
- **Collection**: `showcases`
- **Storage Path**: `showcase-images/`
- **Real-time**: Changes sync immediately across all users

## Troubleshooting

### Image Upload Fails
- Check file size (must be under 10MB)
- Verify file format (JPG, PNG, WebP only)
- Ensure stable internet connection

### Changes Not Appearing
- Check showcase status (must be "Active")
- Verify display order is set correctly
- Clear browser cache and refresh

### Layout Issues
- Ensure you have exactly 4 active showcases for best appearance
- Check image aspect ratios are consistent
- Verify all required fields are filled

## Technical Details

### Files Modified/Created
- `src/services/showcaseService.ts` - Firebase service
- `src/pages/admin/AdminShowcases.tsx` - Admin interface
- `src/components/CategoryShowcase.tsx` - Updated to use Firebase
- `src/App.tsx` - Added route
- `src/pages/admin/AdminLayout.tsx` - Added navigation

### Database Schema
```typescript
interface Showcase {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  cta: string;
  imageUrl: string;
  order: number;
  status: 'active' | 'inactive';
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
```

## Support

For technical assistance or questions, contact your development team.

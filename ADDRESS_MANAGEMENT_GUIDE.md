# Address Management System - User Guide

## Overview
The Address Management system allows users to save, edit, and manage multiple delivery addresses for seamless checkout experience in Sree Rasthu Silvers.

## Features Implemented

### ✅ 1. Saved Addresses Page
- **Access**: Account → Saved Addresses
- **Features**:
  - View all saved addresses
  - Add new addresses
  - Edit existing addresses
  - Delete addresses
  - Set default shipping address
  - Beautiful, branded UI with premium aesthetics

### ✅ 2. Address Form
- **Fields**:
  - Full Name (required)
  - Phone Number (required)
  - Pin Code (required, 6 digits)
  - Locality (optional)
  - Address - Area and Street (required)
  - City (required)
  - State (required)
  - Set as Default checkbox

### ✅ 3. Checkout Integration
- **Mobile Checkout**:
  - Displays saved address in header
  - Tap to change address
  - Bottom sheet modal for address selection
  - Add new address button
  - Auto-selects default address

- **Desktop Checkout**:
  - Shows selected address with details
  - "Change Address" button
  - Modal popup for address selection
  - Add new address navigation
  - Professional layout

### ✅ 4. Default Address Management
- One address can be marked as default
- Auto-selects on checkout
- Setting a new default automatically unsets previous default
- Visual indicators (badges, colors) for default address

## User Flow

### Adding First Address

```
1. User goes to Account Page
   ↓
2. Clicks "Saved Addresses"
   ↓
3. Sees empty state with "Add New Address" button
   ↓
4. Clicks button, form appears
   ↓
5. Fills in required fields
   ↓
6. Optionally checks "Set as default"
   ↓
7. Clicks "Save Address"
   ↓
8. ✓ Success toast appears
   ↓
9. Address appears in list
```

### Using Address at Checkout

```
1. User adds items to cart
   ↓
2. Navigates to Checkout
   ↓
3. System auto-loads default address (or first address)
   ↓
4. Address displayed in checkout header/section
   ↓
5. User can tap/click to change address
   ↓
6. Selects different address from list
   ↓
7. Address updates in checkout
   ↓
8. Proceeds with payment
```

### Managing Multiple Addresses

```
1. Go to Account → Saved Addresses
   ↓
2. View all saved addresses
   ↓
3. Options for each address:
   - Edit (pencil icon)
   - Delete (trash icon)
   - Set as Default (checkmark icon)
```

## UI/UX Design Details

### Color Scheme
- **Primary**: Blue gradient (Blue-600 to Purple-600)
- **Success**: Green-500 (for selection, default badge)
- **Text**: Gray-900 (primary), Gray-600 (secondary)
- **Borders**: Thin, elegant borders (Gray-300)
- **Background**: White cards on Gray-50 background

### Typography
- **Font**: Poppins (clean, modern)
- **Headings**: Bold, 2xl-3xl size
- **Body**: Regular, sm-base size
- **Labels**: Medium weight, sm size

### Icons
- **Address**: MapPin, Home
- **Actions**: Edit2, Trash2, Plus, Check
- **Navigation**: ArrowLeft, ChevronRight

### Animations
- **Form**: Smooth height transitions (0.3s)
- **Cards**: Fade in + slide up (staggered)
- **Modal**: Spring animation (damping: 30, stiffness: 300)
- **Buttons**: Scale on tap (0.97)

### Spacing
- **Cards**: p-6 for desktop, p-4 for mobile
- **Gaps**: space-y-6 for sections, gap-3 for inline elements
- **Padding**: px-4 py-3 for compact areas

### Responsive Design
- **Mobile**: Full-width cards, bottom sheet modals
- **Desktop**: Max-width containers (4xl), centered modals
- **Breakpoint**: 768px (md)

## Component Architecture

### 1. SavedAddresses.tsx
```
SavedAddresses (Main Page)
├── Header (Back button, Title)
├── Add New Address Button
├── Address Form (Animated, conditional)
│   ├── Text Inputs (8 fields)
│   ├── Checkbox (Default)
│   └── Action Buttons (Save, Cancel)
└── Address List
    └── AddressCard (per address)
        ├── Icon + Name + Default Badge
        ├── Full Address Details
        └── Action Buttons (Edit, Delete, Set Default)
```

### 2. Checkout.tsx Integration
```
Checkout
├── MobileCheckout
│   ├── Header with Address Bar (clickable)
│   ├── Address Selector Modal
│   │   ├── Backdrop
│   │   └── Bottom Sheet
│   │       ├── Header (Title + Add New)
│   │       └── Address List (selectable)
│   └── Rest of checkout content
│
└── DesktopCheckout
    ├── Address Section
    │   ├── Selected Address Display
    │   └── Change Address Button
    ├── Address Selector Modal
    │   ├── Backdrop
    │   └── Centered Modal
    │       ├── Header (Title + Add New + Close)
    │       └── Address List (selectable)
    └── Rest of checkout content
```

### 3. addressService.ts
```
Service Functions:
├── addAddress(userId, addressData)
├── getUserAddresses(userId)
├── getAddress(userId, addressId)
├── updateAddress(userId, addressId, updates)
├── deleteAddress(userId, addressId)
├── setDefaultAddress(userId, addressId)
└── getDefaultAddress(userId)
```

## Firebase Data Structure

### Collection Path
```
/users/{userId}/addresses/{addressId}
```

### Document Schema
```typescript
{
  id: string,                    // Auto-generated
  userId: string,                // Owner's UID
  fullName: string,              // "John Doe"
  phoneNumber: string,           // "1234567890"
  pinCode: string,               // "533005"
  locality: string,              // "Thimmaparam" (optional)
  address: string,               // "D No.3-25, Street Name"
  city: string,                  // "Kakinada"
  state: string,                 // "Andhra Pradesh"
  isDefault: boolean,            // true/false
  createdAt: Timestamp,          // Auto-set
  updatedAt: Timestamp           // Auto-updated
}
```

## State Management

### Local State (Component Level)
```typescript
- addresses: Address[]              // All user addresses
- selectedAddress: Address | null   // Currently selected
- showAddressSelector: boolean      // Modal visibility
- showForm: boolean                 // Form visibility
- editingAddress: Address | null    // Edit mode tracking
- formData: AddressFormData         // Form state
- formLoading: boolean              // Submit state
- loading: boolean                  // Initial load
```

### Context Integration
- Uses `useAuth()` for user information
- Uses `useCart()` for checkout integration
- Uses `useToast()` for notifications

## Validation Rules

### Required Fields
- ✅ Full Name (min 2 characters)
- ✅ Phone Number (10 digits)
- ✅ Pin Code (6 digits)
- ✅ Address (min 10 characters)
- ✅ City (min 2 characters)
- ✅ State (min 2 characters)

### Optional Fields
- Locality

### Business Rules
- Only one address can be default at a time
- Setting new default auto-unsets previous default
- User must be authenticated to access addresses
- Users can only access their own addresses

## Error Handling

### Common Errors
1. **"Failed to load addresses"**
   - Check internet connection
   - Verify Firebase authentication
   - Check Firebase security rules

2. **"Failed to save address"**
   - Check all required fields are filled
   - Verify user is authenticated
   - Check Firebase write permissions

3. **"Failed to update default address"**
   - Verify addressId exists
   - Check user owns the address

### Error Display
- Toast notifications for all errors
- Descriptive error messages
- Red variant for error toasts
- Auto-dismiss after 5 seconds

## Success Notifications

### Toast Messages
- ✓ "Address added successfully"
- ✓ "Address updated successfully"
- ✓ "Address deleted successfully"
- ✓ "Default address updated"

### Visual Feedback
- Loading spinners during operations
- Disabled buttons during submission
- Smooth transitions
- Immediate UI updates

## Performance Optimizations

### Data Fetching
- Load addresses only when needed
- Cache addresses in component state
- Fetch once per page load
- Real-time updates not needed (manual refresh)

### Rendering
- AnimatePresence for smooth animations
- Conditional rendering for modals
- Lazy loading for address selector
- Debounced search (if implemented later)

### Firebase Optimization
- Single query for all addresses
- OrderBy createdAt DESC (newest first)
- No pagination needed (typically <10 addresses)
- Batch updates for default address changes

## Accessibility

### Keyboard Navigation
- Tab through form fields
- Enter to submit form
- Escape to close modals
- Arrow keys for address selection (future enhancement)

### Screen Readers
- Semantic HTML (buttons, labels, inputs)
- ARIA labels where needed
- Descriptive button text
- Clear form labels

### Visual Accessibility
- High contrast (Gray-900 on White)
- Large touch targets (min 44px)
- Clear focus states
- Readable font sizes (min 12px)

## Testing Checklist

### Functional Tests
- [ ] Add first address
- [ ] Add multiple addresses
- [ ] Edit existing address
- [ ] Delete address
- [ ] Set address as default
- [ ] Change default address
- [ ] Select address at checkout (mobile)
- [ ] Select address at checkout (desktop)
- [ ] Add address from checkout (no addresses)
- [ ] Form validation works

### UI/UX Tests
- [ ] Responsive on mobile
- [ ] Responsive on tablet
- [ ] Responsive on desktop
- [ ] Animations smooth
- [ ] Toasts appear and dismiss
- [ ] Loading states visible
- [ ] Empty state displays correctly
- [ ] Default badge visible

### Edge Cases
- [ ] No addresses saved
- [ ] Only one address
- [ ] Many addresses (10+)
- [ ] Very long address text
- [ ] Special characters in address
- [ ] Delete default address (auto-selects new default)
- [ ] Offline behavior
- [ ] Concurrent default address updates

## Future Enhancements

### Potential Features
1. **Address Validation**
   - Pin code API verification
   - Google Maps autocomplete
   - Address standardization

2. **Address Types**
   - Home, Office, Other labels
   - Custom labels
   - Icons per type

3. **Quick Actions**
   - Copy address
   - Share address
   - Print label

4. **Advanced Features**
   - Delivery instructions field
   - Landmark field
   - Coordinates (lat/lng)
   - Delivery time preferences

5. **Bulk Operations**
   - Delete multiple addresses
   - Import addresses from file
   - Export addresses

## Troubleshooting

### Issue: Addresses not loading
**Solution**: 
1. Check console for errors
2. Verify user is authenticated
3. Check Firebase security rules
4. Ensure internet connection

### Issue: Cannot set default
**Solution**:
1. Check for concurrent updates
2. Verify address exists in database
3. Check Firebase write permissions

### Issue: Form not submitting
**Solution**:
1. Check all required fields filled
2. Verify validation passes
3. Check browser console for errors
4. Ensure formLoading state isn't stuck

### Issue: Address not appearing in checkout
**Solution**:
1. Reload checkout page
2. Check if address has isDefault: true
3. Verify address belongs to current user
4. Check selectedAddress state in checkout

---

**Version**: 1.0  
**Last Updated**: February 9, 2026  
**Platform**: Web (React + TypeScript + Firebase)

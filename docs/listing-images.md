# Listing photos

Edit Listing includes a collapsible Images section beneath each unit's listing heading. Select multiple JPEG, PNG or WebP files, up to 20 MB each. New uploads must be exactly 1024 × 768 pixels; incorrect dimensions and HEIC files receive actionable errors. Images are re-encoded as JPEG. Preparing, uploading, saved and per-file retry states are available.

Add labels (120 characters maximum), save labels explicitly, move photos earlier/later, or make a photo the cover. The first photo is the cover. Remove hides a photo without deleting the file; Undo removal restores the most recent removal in the current editor session. Older removals remain recoverable in Supabase. Existing public property images remain a fallback when a listing has no uploaded photos.

## Storage and publication

The private Supabase `listing-images` bucket stores `<unit UUID>/<image UUID>.jpg`. `public.listing_images` records ownership, original name, label, order, readiness and removal time. Only existing property editors can manage these records or objects. Metadata is reserved before upload, and only finalized images appear. Interrupted uploads may leave private pending rows/objects; reselect files after a reload if necessary. No automatic permanent cleanup is enabled.

A restricted RPC exposes only display metadata for ready, non-removed photos on published Available/Coming soon listings. Storage read policy applies the same eligibility rule. Public cards use the cover and detail pages display the selectable gallery with labels. Drafts and unpublished/occupied/off-market listings are excluded. Signed viewing URLs last an hour, so a previously issued URL may work for up to an hour after removal or unpublishing. The editor and public gallery refresh URLs while mounted.

## Validation

69 tests passed; lint and production build passed (existing bundle-size warning). Tests cover exact dimensions, unsupported formats, bitmap disposal, cover ordering, selection/captions, and removal/undo. Transactional database tests verify unassigned-user restrictions, published eligibility, exclusion of pending/removed/unpublished photos and unauthorized reorder rejection. No fixture changes persist from SQL tests.

The signed-in local Carthage editor was checked for the matching collapsible Images section and size note. Browser automation refused file injection in the upload phase (`Not allowed`); no workaround was attempted. Real uploads, saved-thumbnail reload, photo orientation and physical iPhone behavior remain manual checks.

## Manual acceptance

Upload two 1024 × 768 photos in Carthage > Edit Listing > Main Unit listing > Images. Confirm Saved and thumbnails after refreshing. Label each, save, make the second the cover and check the signed-out local homepage and listing gallery. Remove a photo and undo. Check another unit stays separate. A photo with different dimensions must be rejected. For published listings, uploaded photos become public automatically.

Application changes remain local until committed and pushed. Storage migrations have been applied to linked Supabase.

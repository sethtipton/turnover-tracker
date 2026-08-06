import imageFourVine from "../../property-images/processed/4-vine-ct.webp";
import imageOneTwentyFourMantua from "../../property-images/processed/124-n-mantua-st.webp";
import imageOneTwentySevenPearl from "../../property-images/processed/127-s-pearl-st.webp";
import imageThreeTenPark from "../../property-images/processed/310-park-ave.webp";
import imageFourFortyOnePark from "../../property-images/processed/441-park-ave.webp";
import imageFourFortySevenPark from "../../property-images/processed/447-park-ave.webp";
import imageFourFiftyOnePark from "../../property-images/processed/451-park-ave.webp";
import imageFourFiftyEightMain from "../../property-images/processed/458-w-main-st.webp";
import imageFourSixtyNineCarthage from "../../property-images/processed/469-carthage-ave.webp";
import imageHudsonDuplex from "../../property-images/processed/1065-hudson-rd.webp";

const PROPERTY_IMAGES = {
  "451 Park": imageFourFiftyOnePark,
  "441 Park": imageFourFortyOnePark,
  "447 Park": imageFourFortySevenPark,
  "447 Park Ave": imageFourFortySevenPark,
  "1065/1067 Hudson": imageHudsonDuplex,
  "4 Vine": imageFourVine,
  "124/126 N Mantua": imageOneTwentyFourMantua,
  "469 Carthage": imageFourSixtyNineCarthage,
  "458 W Main": imageFourFiftyEightMain,
  "133 S Pearl": imageOneTwentySevenPearl,
  "310 Park": imageThreeTenPark,
};

const PROPERTY_IMAGES_BY_SLUG = Object.fromEntries(
  Object.entries(PROPERTY_IMAGES).map(([propertyName, image]) => [toPropertySlug(propertyName), image]),
);

export function getPropertyImage(propertyName) {
  return PROPERTY_IMAGES[propertyName] || "";
}

export function getPropertyImageBySlug(propertySlug) {
  return PROPERTY_IMAGES_BY_SLUG[propertySlug] || "";
}

export function getPropertyImageTransitionName(propertyId) {
  if (!propertyId) return undefined;
  const safeId = String(propertyId).replace(/[^a-zA-Z0-9_-]/g, "-");
  return `property-image-${safeId}`;
}

export function getPropertyTitleTransitionName(propertyId) {
  if (!propertyId) return undefined;
  const safeId = String(propertyId).replace(/[^a-zA-Z0-9_-]/g, "-");
  return `property-title-${safeId}`;
}

function toPropertySlug(value) {
  return value
    .trim()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

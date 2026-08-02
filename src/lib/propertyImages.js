import imageFourVine from "../../property-images/processed/4-vine-ct.webp";
import imageOneTwentyFourMantua from "../../property-images/processed/124-n-mantua-st.webp";
import imageOneTwentySevenPearl from "../../property-images/processed/127-s-pearl-st.webp";
import imageThreeTenPark from "../../property-images/processed/310-park-ave.webp";
import imageThreeTwentyTwoPark from "../../property-images/processed/322-park-ave.webp";
import imageFourFortyOnePark from "../../property-images/processed/441-park-ave.webp";
import imageFourFiftyOnePark from "../../property-images/processed/451-park-ave.webp";
import imageFourFiftyEightMain from "../../property-images/processed/458-w-main-st.webp";
import imageFourSixtyNineCarthage from "../../property-images/processed/469-carthage-ave.webp";
import imageHudsonDuplex from "../../property-images/processed/1065-hudson-rd.webp";

const PROPERTY_IMAGES = {
  "451 Park": imageFourFiftyOnePark,
  "441 Park": imageFourFortyOnePark,
  "1065/1067 Hudson": imageHudsonDuplex,
  "4 Vine Ct": imageFourVine,
  "124/126 N Mantua": imageOneTwentyFourMantua,
  "469 Carthage": imageFourSixtyNineCarthage,
  "458 W Main": imageFourFiftyEightMain,
  "127 S Pearl": imageOneTwentySevenPearl,
  "322 Park": imageThreeTwentyTwoPark,
  "310 Park": imageThreeTenPark,
};

export function getPropertyImage(propertyName) {
  return PROPERTY_IMAGES[propertyName] || "";
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

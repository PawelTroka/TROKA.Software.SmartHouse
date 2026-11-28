/** A daylight design appearance, not a guarantee of night-time privacy.
 * The exterior face occludes the room to show the intended daytime privacy;
 * the inward face stays tinted and transparent. The existing sky environment
 * supplies reflection without another scene capture or shader. This visual
 * approximation does not simulate a real glazing assembly's lighting ratio.
 */
export const REFLECTIVE_PRIVACY_GLAZING=Object.freeze({
  glazing:'reflective-privacy',privacy:true,privacyCondition:'outside-brighter-than-inside',
  nightPrivacyGuaranteed:false,outlook:'side-garden',
});

// Renderer owners supply their Three namespace, keeping the aperture metadata
// usable by plans/exports without making them import the WebGL engine.
export function createReflectivePrivacyGlassMaterials(THREE){
  const exterior=new THREE.MeshStandardMaterial({color:'#c9d4d5',roughness:.07,metalness:.92,
    transparent:false,opacity:1,depthWrite:true,side:THREE.FrontSide,envMapIntensity:1.2});
  const interior=new THREE.MeshPhysicalMaterial({color:'#61787a',roughness:.06,metalness:.05,
    transparent:true,opacity:.17,depthWrite:false,side:THREE.FrontSide,ior:1.5,reflectivity:.2});
  for(const [face,material]of [['exterior',exterior],['interior',interior]]){
    material.name='reflective-privacy-glass-'+face;
    Object.assign(material.userData,REFLECTIVE_PRIVACY_GLAZING,{privacyFace:face,transient:true,
      appearance:'environment-reflection-daylight-approximation'});
  }
  return {reflectivePrivacyExterior:exterior,reflectivePrivacyInterior:interior};
}

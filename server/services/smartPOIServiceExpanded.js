/**
 * Smart POI Service EXPANDED - 4-quadrant search with extended tags
 *
 * MEJORA: +452% POIs vs método original (23 → 127 POIs)
 * MÉTODO: Búsqueda por 4 cuadrantes de 3.5km
 * TAGS: Incluye parques, plazas, calles, barrios, miradores, puentes
 *
 * Algorithm:
 * 1. Calculate total POIs = days × poisPerDay (based on intensity)
 * 2. Fetch POIs usando búsqueda expandida por cuadrantes
 * 3. Categorize POIs con sistema de ranking mejorado
 * 4. Divide city into N geographic phases using K-means clustering
 * 5. Assign poisPerDay closest POIs to each phase
 * 6. Optimize route within each phase using nearest-neighbor
 * 7. Enrich selected POIs in parallel (descriptions + images)
 */

import { fetchPOIsFromCityExpanded } from './expandedOverpassService.js';
import categoryRankingService from './categoryRankingService.js';

/**
 * Intensity configuration
 */
const INTENSITY_CONFIG = {
  relaxed: {
    poisPerDay: 4, // Relaxed: 4 POIs per day
    totalDays: 3,
  },
  balanced: {
    poisPerDay: 6, // Balanced: 6 POIs per day
    totalDays: 4,
  },
  active: {
    poisPerDay: 7, // Active: 7 POIs per day
    totalDays: 5,
  },
};

class SmartPOIService {
  /**
   * Main method: Get POIs for a complete trip
   *
   * @param {string} destination - City name
   * @param {Object} preferences - User preferences { intensity, interests, days }
   * @returns {Promise<Object>} POIs organized by day
   */
  async getPOIsForTrip(destination, preferences) {
    const {
      intensity = 'balanced',
      interests = ['history', 'culture'],
      days,
    } = preferences;

    console.log(
      '\n[SMART-POI-EXP] ========== Wikipedia-Filtered POI Algorithm =========='
    );
    console.log(`[SMART-POI-EXP] Destination: ${destination}`);
    console.log(`[SMART-POI-EXP] Intensity: ${intensity}`);
    console.log(`[SMART-POI-EXP] Days: ${days}`);

    try {
      const config = INTENSITY_CONFIG[intensity] || INTENSITY_CONFIG.balanced;
      const poisPerDay = config.poisPerDay;
      const numDays = days || config.totalDays;
      const totalPOIsNeeded = poisPerDay * numDays;

      console.log(
        `[SMART-POI-EXP] Formula: ${numDays} days × ${poisPerDay} POIs/day = ${totalPOIsNeeded} total\n`
      );

      // STEP 1: Fetch POIs using EXPANDED quadrant search
      console.log(
        `[SMART-POI-EXP] STEP 1: Fetching POIs with expanded search...`
      );
      const allPOIs = await fetchPOIsFromCityExpanded(destination, {
        interests,
        limit: totalPOIsNeeded * 3, // 3x margin for deduplication
      });

      console.log(
        `[SMART-POI-EXP] ✓ Retrieved ${allPOIs.length} Wikipedia-quality POIs`
      );

      if (allPOIs.length === 0) {
        throw new Error('No Wikipedia-quality POIs found');
      }

      // STEP 2: Deduplicate
      console.log(`[SMART-POI-EXP] STEP 2: Deduplicating...`);
      const deduplicated = this.deduplicatePOIs(allPOIs);
      console.log(`[SMART-POI-EXP] ✓ ${deduplicated.length} unique POIs`);

      // 🔥 STEP 3: Categorize POIs and generate rankings
      console.log(
        `[SMART-POI-EXP] STEP 3: Categorizing POIs (monuments, culture, streets)...`
      );
      const categorized = categoryRankingService.categorizePOIs(deduplicated);

      // Generate and print rankings (debugging)
      const rankings =
        categoryRankingService.generateCategoryRankings(categorized);
      if (process.env.DEBUG_RANKINGS === 'true') {
        categoryRankingService.printCategoryRankings(rankings);
      }

      // 🔥 STEP 4: Select TOP N POIs with weighted distribution
      console.log(
        `[SMART-POI-EXP] STEP 4: Selecting ${totalPOIsNeeded} POIs with weighted distribution...`
      );
      const topPOIs = categoryRankingService.selectTopPOIsByCategory(
        categorized,
        totalPOIsNeeded
      );

      const avgScore =
        topPOIs.reduce((sum, p) => sum + (p.relevanceScore || 0), 0) /
        topPOIs.length;
      console.log(
        `[SMART-POI-EXP] ✓ Selected ${
          topPOIs.length
        } POIs (avg score: ${avgScore.toFixed(1)})`
      );

      // 🔥 STEP 5: Divide city into N geographic phases (K-means clustering)
      console.log(
        `[SMART-POI-EXP] STEP 5: K-means clustering into ${numDays} phases...`
      );
      const phases = this.kMeansGeographic(topPOIs, numDays, poisPerDay);
      console.log(`[SMART-POI-EXP] ✓ Created ${phases.length} phases`);

      // 🔥 STEP 6: Assign POIs from each cluster directly (respect geographic zones!)
      console.log(
        `[SMART-POI-EXP] STEP 6: Assigning POIs from geographic clusters (respecting K-means zones)...`
      );
      const dayByDay = {};

      phases.forEach((phase, idx) => {
        const dayNum = idx + 1;

        // 🔥 USAR LOS POIs QUE YA ESTÁN EN EL CLUSTER (no redistribuir!)
        // El K-means YA organizó geográficamente, solo debemos:
        // 1. Tomar los N mejores POIs del cluster (por importancia)
        // 2. Optimizar la ruta dentro de esa zona

        const clusterPOIs = phase.pois;

        // Si el cluster tiene más POIs de los que necesitamos, seleccionar los mejores
        let selectedPOIs;
        if (clusterPOIs.length > poisPerDay) {
          // Ordenar por relevancia y tomar los top N
          selectedPOIs = [...clusterPOIs]
            .sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0))
            .slice(0, poisPerDay);

          console.log(
            `[SMART-POI-EXP]   Day ${dayNum}: Selected top ${poisPerDay} POIs from cluster of ${clusterPOIs.length} (by importance)`
          );
        } else {
          // Si el cluster es pequeño, usar todos
          selectedPOIs = clusterPOIs;

          console.log(
            `[SMART-POI-EXP]   Day ${dayNum}: Using all ${selectedPOIs.length} POIs from cluster`
          );
        }

        // Optimize route (nearest-neighbor within the cluster zone)
        const optimizedRoute = this.optimizeRoute(selectedPOIs);

        // Calculate statistics for the route
        const dayDistances = [];
        for (let i = 0; i < optimizedRoute.length - 1; i++) {
          const dist = this.geographicDistance(
            optimizedRoute[i].coordinates,
            optimizedRoute[i + 1].coordinates
          );
          dayDistances.push(dist);
        }

        const maxDist = dayDistances.length > 0 ? Math.max(...dayDistances) : 0;
        const avgDist =
          dayDistances.length > 0
            ? dayDistances.reduce((a, b) => a + b, 0) / dayDistances.length
            : 0;

        // Calculate average relevance score for this day
        const avgRelevance =
          optimizedRoute.reduce(
            (sum, poi) => sum + (poi.relevanceScore || 0),
            0
          ) / optimizedRoute.length;

        dayByDay[`day${dayNum}`] = {
          dayNumber: dayNum,
          zone: `Zona ${dayNum}`,
          center: phase.center,
          pois: optimizedRoute,
          poisCount: optimizedRoute.length,
        };

        console.log(
          `[SMART-POI-EXP]   Day ${dayNum}: ${
            optimizedRoute.length
          } POIs - Cluster ${idx + 1}`
        );
        console.log(
          `[SMART-POI-EXP]     Route: max=${maxDist.toFixed(
            2
          )}km, avg=${avgDist.toFixed(2)}km, relevance=${avgRelevance.toFixed(
            1
          )}`
        );
        console.log(
          `[SMART-POI-EXP]     POIs: ${optimizedRoute
            .map((p) => p.name)
            .join(' → ')}`
        );
      });

      // ❌ ELIMINADO: Las búsquedas de restaurantes saturan la API de Overpass
      // TODO: Implementar con caché local o usar API de Google Places

      // 🔥 STEP 7: Enriquecer SOLO los POIs seleccionados EN PARALELO
      console.log(
        '[SMART-POI-EXP] STEP 7: Enriching selected POIs (parallel: descriptions + images)...'
      );
      const allSelectedPOIs = Object.values(dayByDay).flatMap(
        (day) => day.pois
      );
      const { enrichPOIsWithDescriptions, enrichPOIsWithImages } = await import(
        './overpassService.js'
      );

      const enrichmentStart = Date.now();

      // 🚀 EJECUTAR EN PARALELO: descripciones + tips + imágenes
      await Promise.all([
        enrichPOIsWithDescriptions(allSelectedPOIs),
        enrichPOIsWithImages(allSelectedPOIs),
      ]);

      const enrichmentTime = ((Date.now() - enrichmentStart) / 1000).toFixed(2);
      console.log(
        `[SMART-POI-EXP] ✓ Enrichment completed in ${enrichmentTime}s (parallel)`
      );

      const totalAssigned = Object.values(dayByDay).reduce(
        (sum, day) => sum + day.poisCount,
        0
      );
      console.log(
        `[SMART-POI-EXP] ✓ Complete: ${totalAssigned} POIs assigned\n`
      );

      return {
        dayByDay,
        stats: {
          total: totalAssigned,
          avgRelevanceScore: avgScore.toFixed(1),
          poisPerDay: poisPerDay,
          days: Object.keys(dayByDay).length,
        },
      };
    } catch (error) {
      console.error('[SMART-POI-EXP] Error:', error.message);
      throw error;
    }
  }

  /**
   * Deduplicate POIs by name and proximity (< 100m)
   * @private
   */
  deduplicatePOIs(pois) {
    const unique = [];
    const seen = new Set();

    for (const poi of pois) {
      const nameKey = poi.name.toLowerCase().trim();

      if (seen.has(nameKey)) continue;

      const hasDuplicate = unique.some((existing) => {
        if (!existing.coordinates || !poi.coordinates) return false;
        const distance = this.geographicDistance(
          existing.coordinates,
          poi.coordinates
        );
        return distance < 0.1; // 100 meters
      });

      if (!hasDuplicate) {
        unique.push(poi);
        seen.add(nameKey);
      }
    }

    return unique;
  }

  /**
   * K-means geographic clustering MEJORADO
   * Usa K-means++ para mejor inicialización
   * Incluye validación de calidad y rebalanceo automático
   * @private
   */
  kMeansGeographic(pois, k, poisPerDay = null) {
    const maxIterations = 30;

    console.log(
      `[SMART-POI-EXP] K-means clustering: ${
        pois.length
      } POIs into ${k} clusters (min ${poisPerDay || 'auto'} per cluster)`
    );

    // Intentar hasta 3 veces si la calidad es mala
    let bestClusters = null;
    let bestQuality = -Infinity;

    for (let attempt = 0; attempt < 3; attempt++) {
      let centroids = this.initializeCentroidsKMeansPlusPlus(pois, k);

      if (attempt === 0) {
        console.log(
          `[SMART-POI-EXP] Initial centroids separation: ${this.calculateAvgSeparation(
            centroids
          ).toFixed(2)}km`
        );
      }

      let previousAssignments = [];

      for (let iter = 0; iter < maxIterations; iter++) {
        const assignments = pois.map((poi) => {
          let minDist = Infinity;
          let closestIdx = 0;

          centroids.forEach((centroid, idx) => {
            const dist = this.geographicDistance(poi.coordinates, centroid);
            if (dist < minDist) {
              minDist = dist;
              closestIdx = idx;
            }
          });

          return closestIdx;
        });

        if (
          previousAssignments.length > 0 &&
          assignments.every((a, i) => a === previousAssignments[i])
        ) {
          if (attempt === 0) {
            console.log(
              `[SMART-POI-EXP] K-means converged at iteration ${iter + 1}`
            );
          }
          break;
        }

        previousAssignments = [...assignments];

        const newCentroids = [];
        for (let i = 0; i < k; i++) {
          const clusterPOIs = pois.filter((_, idx) => assignments[idx] === i);

          if (clusterPOIs.length === 0) {
            newCentroids.push(centroids[i]);
          } else {
            const avgLat =
              clusterPOIs.reduce((sum, p) => sum + p.coordinates.lat, 0) /
              clusterPOIs.length;
            const avgLng =
              clusterPOIs.reduce((sum, p) => sum + p.coordinates.lng, 0) /
              clusterPOIs.length;
            newCentroids.push({ lat: avgLat, lng: avgLng });
          }
        }

        centroids = newCentroids;
      }

      const clusters = [];
      const finalAssignments = pois.map((poi) => {
        let minDist = Infinity;
        let closestIdx = 0;

        centroids.forEach((centroid, idx) => {
          const dist = this.geographicDistance(poi.coordinates, centroid);
          if (dist < minDist) {
            minDist = dist;
            closestIdx = idx;
          }
        });

        return closestIdx;
      });

      for (let i = 0; i < k; i++) {
        const clusterPOIs = pois.filter(
          (_, idx) => finalAssignments[idx] === i
        );

        if (clusterPOIs.length > 0) {
          const distances = clusterPOIs.map((poi) =>
            this.geographicDistance(poi.coordinates, centroids[i])
          );
          const avgDist =
            distances.reduce((a, b) => a + b, 0) / distances.length;
          const maxDist = Math.max(...distances);

          clusters.push({
            center: centroids[i],
            pois: clusterPOIs,
            stats: {
              size: clusterPOIs.length,
              avgDistanceToCenter: avgDist,
              maxDistanceToCenter: maxDist,
            },
          });
        }
      }

      const quality = this.evaluateClusteringQuality(clusters);

      if (attempt === 0 || quality > bestQuality) {
        bestQuality = quality;
        bestClusters = clusters;
      }

      if (quality > 0.7) break;
    }

    // PASO 1: Eliminar POIs huérfanos primero
    bestClusters = this.removeOrphanPOIs(bestClusters);

    // PASO 2: Rebalancear clusters después de limpiar huérfanos
    // 🔥 Pasar poisPerDay como mínimo estricto para garantizar suficientes POIs
    bestClusters = this.rebalanceClusters(bestClusters, poisPerDay);

    // Evaluar calidad DESPUÉS del rebalanceo
    const finalQuality = this.evaluateClusteringQuality(bestClusters);
    bestClusters.forEach((cluster, idx) => {
      console.log(
        `[SMART-POI-EXP]   Cluster ${idx + 1}: ${
          cluster.stats.size
        } POIs, avg dist: ${cluster.stats.avgDistanceToCenter.toFixed(
          2
        )}km, max: ${cluster.stats.maxDistanceToCenter.toFixed(2)}km`
      );
    });

    console.log(
      `[SMART-POI-EXP] ✓ Clustering quality: ${finalQuality.toFixed(2)}`
    );

    return bestClusters;
  }

  evaluateClusteringQuality(clusters) {
    const sizes = clusters.map((c) => c.stats.size);
    const avgSize = sizes.reduce((a, b) => a + b, 0) / sizes.length;
    const sizeVariance =
      sizes.reduce((sum, s) => sum + Math.pow(s - avgSize, 2), 0) /
      sizes.length;
    const balanceScore = 1 / (1 + sizeVariance / (avgSize * avgSize));

    const avgCompactness =
      clusters.reduce((sum, c) => sum + c.stats.avgDistanceToCenter, 0) /
      clusters.length;
    const compactnessScore = 1 / (1 + avgCompactness);

    const separation = this.calculateAvgSeparation(
      clusters.map((c) => c.center)
    );
    const separationScore = Math.min(1, separation / 3);

    return balanceScore * 0.4 + compactnessScore * 0.3 + separationScore * 0.3;
  }

  rebalanceClusters(clusters, poisPerDay = null) {
    const avgSize =
      clusters.reduce((sum, c) => sum + c.stats.size, 0) / clusters.length;

    // 🔥 CAMBIO: Si se especifica poisPerDay, usarlo como mínimo estricto
    // De lo contrario, usar 75% del promedio
    const minSize = poisPerDay
      ? poisPerDay // Mínimo = poisPerDay (ej: 6 POIs/día)
      : Math.max(Math.floor(avgSize * 0.75), 4);

    const maxSize = Math.ceil(avgSize * 1.25); // Máximo 125% del promedio

    console.log(
      `[SMART-POI-EXP] Rebalancing clusters (target: ${Math.round(
        avgSize
      )} POIs, strict min: ${minSize}, max: ${maxSize})`
    );

    const rebalanced = clusters.map((c) => ({ ...c, pois: [...c.pois] }));

    // Hacer múltiples pasadas hasta que esté balanceado
    let maxPasses = 5;
    let passNum = 0;

    while (passNum < maxPasses) {
      passNum++;
      let anyChanges = false;

      // Identificar clusters pequeños y grandes
      const tooSmall = rebalanced
        .map((c, idx) => ({ idx, size: c.stats.size }))
        .filter((c) => c.size < minSize)
        .sort((a, b) => a.size - b.size); // Más pequeños primero

      const tooBig = rebalanced
        .map((c, idx) => ({ idx, size: c.stats.size }))
        .filter((c) => c.size > maxSize)
        .sort((a, b) => b.size - a.size); // Más grandes primero

      if (tooSmall.length === 0 && tooBig.length === 0) break;

      // PASO 1: Para cada cluster GRANDE, forzar redistribución a los más cercanos
      tooBig.forEach(({ idx: bigIdx }) => {
        const excess = rebalanced[bigIdx].stats.size - maxSize;
        if (excess <= 0) return;

        // Encontrar todos los otros clusters ordenados por distancia al centroide del grande
        const nearbyСlusters = rebalanced
          .map((c, idx) => ({
            idx,
            distance: this.geographicDistance(
              c.center,
              rebalanced[bigIdx].center
            ),
            size: c.stats.size,
          }))
          .filter((c) => c.idx !== bigIdx && c.size < maxSize)
          .sort((a, b) => a.distance - b.distance);

        // Para cada POI del cluster grande, encontrar el cluster más cercano
        const poisByDistance = rebalanced[bigIdx].pois
          .map((poi) => {
            let closestCluster = null;
            let minDist = Infinity;

            nearbyСlusters.forEach(({ idx }) => {
              const dist = this.geographicDistance(
                poi.coordinates,
                rebalanced[idx].center
              );
              if (dist < minDist) {
                minDist = dist;
                closestCluster = idx;
              }
            });

            return { poi, targetCluster: closestCluster, distance: minDist };
          })
          .filter((p) => p.targetCluster !== null)
          .sort((a, b) => a.distance - b.distance);

        // Mover los POIs más cercanos a otros clusters
        let moved = 0;
        for (const { poi, targetCluster } of poisByDistance) {
          if (moved >= excess) break;
          if (rebalanced[targetCluster].pois.length >= maxSize) continue;

          rebalanced[bigIdx].pois = rebalanced[bigIdx].pois.filter(
            (p) => p !== poi
          );
          rebalanced[targetCluster].pois.push(poi);
          moved++;
          anyChanges = true;
        }

        if (moved > 0) {
          console.log(
            `[SMART-POI-EXP]   Pass ${passNum}: Moved ${moved} POIs from large cluster ${
              bigIdx + 1
            } (now ${rebalanced[bigIdx].pois.length})`
          );
        }
      });

      // PASO 2: Para cada cluster pequeño, robar de CUALQUIER cluster que pueda donar
      tooSmall.forEach(({ idx: smallIdx }) => {
        const needed = minSize - rebalanced[smallIdx].stats.size;
        if (needed <= 0) return;

        // 🔥 CAMBIO: Recolectar POIs de TODOS los clusters que tienen > minSize
        const candidates = [];
        rebalanced.forEach((cluster, bigIdx) => {
          if (bigIdx === smallIdx) return;
          if (cluster.pois.length <= minSize) return; // No robar de clusters que ya están al mínimo

          cluster.pois.forEach((poi) => {
            const distToSmall = this.geographicDistance(
              poi.coordinates,
              rebalanced[smallIdx].center
            );
            const distToBig = this.geographicDistance(
              poi.coordinates,
              cluster.center
            );

            candidates.push({
              poi,
              fromCluster: bigIdx,
              distance: distToSmall,
              improvement: distToBig - distToSmall, // Positivo si está más cerca del cluster pequeño
            });
          });
        });

        // Ordenar por distancia al cluster pequeño (más cercanos primero)
        candidates.sort((a, b) => a.distance - b.distance);

        // Mover los POIs más cercanos
        let moved = 0;
        for (const candidate of candidates) {
          if (moved >= needed) break;
          if (rebalanced[candidate.fromCluster].pois.length <= minSize)
            continue;

          // Mover el POI
          rebalanced[candidate.fromCluster].pois = rebalanced[
            candidate.fromCluster
          ].pois.filter((p) => p !== candidate.poi);
          rebalanced[smallIdx].pois.push(candidate.poi);
          moved++;
          anyChanges = true;
        }

        if (moved > 0) {
          console.log(
            `[SMART-POI-EXP]   Pass ${passNum}: Moved ${moved} POIs to cluster ${
              smallIdx + 1
            } (now ${rebalanced[smallIdx].pois.length})`
          );
        }
      });

      if (!anyChanges) break;

      // Recalcular estadísticas después de cada pasada
      rebalanced.forEach((cluster) => {
        if (cluster.pois.length === 0) return;

        const avgLat =
          cluster.pois.reduce((sum, p) => sum + p.coordinates.lat, 0) /
          cluster.pois.length;
        const avgLng =
          cluster.pois.reduce((sum, p) => sum + p.coordinates.lng, 0) /
          cluster.pois.length;
        cluster.center = { lat: avgLat, lng: avgLng };

        const distances = cluster.pois.map((poi) =>
          this.geographicDistance(poi.coordinates, cluster.center)
        );
        cluster.stats = {
          size: cluster.pois.length,
          avgDistanceToCenter:
            distances.reduce((a, b) => a + b, 0) / distances.length || 0,
          maxDistanceToCenter: Math.max(...distances, 0),
        };
      });
    }

    return rebalanced.filter((c) => c.pois.length > 0);
  }

  /**
   * Elimina POIs "huérfanos" - POIs que están más cerca de otro cluster
   * O POIs que están muy lejos del resto de su propio cluster
   * Esto evita que haya POIs aislados geográficamente en clusters incorrectos
   * @private
   */
  removeOrphanPOIs(clusters) {
    console.log('[SMART-POI-EXP] Checking for orphan POIs...');

    let totalMoved = 0;
    const cleaned = clusters.map((c) => ({ ...c, pois: [...c.pois] }));

    // PASO 1: Detectar POIs que están más cerca de otro cluster
    cleaned.forEach((cluster, clusterIdx) => {
      const orphans = [];

      cluster.pois.forEach((poi) => {
        const distToOwnCluster = this.geographicDistance(
          poi.coordinates,
          cluster.center
        );

        // Buscar si hay un cluster más cercano
        let closestCluster = clusterIdx;
        let minDist = distToOwnCluster;

        cleaned.forEach((otherCluster, otherIdx) => {
          if (otherIdx === clusterIdx) return;

          const distToOther = this.geographicDistance(
            poi.coordinates,
            otherCluster.center
          );

          // Si está más cerca del otro cluster (umbral 85%)
          if (distToOther < minDist * 0.85) {
            minDist = distToOther;
            closestCluster = otherIdx;
          }
        });

        if (closestCluster !== clusterIdx) {
          orphans.push({
            poi,
            targetCluster: closestCluster,
            reason: 'closer-to-other',
          });
        }
      });

      // Mover los huérfanos
      orphans.forEach(({ poi, targetCluster }) => {
        cleaned[clusterIdx].pois = cleaned[clusterIdx].pois.filter(
          (p) => p !== poi
        );
        cleaned[targetCluster].pois.push(poi);
        totalMoved++;
      });
    });

    // PASO 2: Detectar POIs que están muy lejos del resto de su cluster
    cleaned.forEach((cluster, clusterIdx) => {
      if (cluster.pois.length < 3) return; // Skip clusters pequeños

      const outliers = [];

      cluster.pois.forEach((poi) => {
        // Calcular distancia promedio a los OTROS POIs del cluster (no al centroide)
        const distancesToOthers = cluster.pois
          .filter((p) => p !== poi)
          .map((other) =>
            this.geographicDistance(poi.coordinates, other.coordinates)
          );

        const avgDistToOthers =
          distancesToOthers.reduce((a, b) => a + b, 0) /
          distancesToOthers.length;

        // Si está muy lejos del resto del cluster (>2x la distancia promedio)
        const clusterAvgDist = cluster.stats.avgDistanceToCenter;
        if (avgDistToOthers > clusterAvgDist * 2.5) {
          // Buscar el cluster más cercano
          let closestCluster = clusterIdx;
          let minDist = Infinity;

          cleaned.forEach((otherCluster, otherIdx) => {
            if (otherIdx === clusterIdx) return;

            const distToOther = this.geographicDistance(
              poi.coordinates,
              otherCluster.center
            );

            if (distToOther < minDist) {
              minDist = distToOther;
              closestCluster = otherIdx;
            }
          });

          if (closestCluster !== clusterIdx) {
            outliers.push({
              poi,
              targetCluster: closestCluster,
              reason: 'far-from-cluster',
            });
          }
        }
      });

      // Mover los outliers
      outliers.forEach(({ poi, targetCluster }) => {
        cleaned[clusterIdx].pois = cleaned[clusterIdx].pois.filter(
          (p) => p !== poi
        );
        cleaned[targetCluster].pois.push(poi);
        totalMoved++;
      });
    });

    if (totalMoved > 0) {
      console.log(
        `[SMART-POI-EXP]   Moved ${totalMoved} orphan POIs to their nearest clusters`
      );

      // Recalcular centroides y estadísticas
      cleaned.forEach((cluster) => {
        if (cluster.pois.length === 0) return;

        const avgLat =
          cluster.pois.reduce((sum, p) => sum + p.coordinates.lat, 0) /
          cluster.pois.length;
        const avgLng =
          cluster.pois.reduce((sum, p) => sum + p.coordinates.lng, 0) /
          cluster.pois.length;
        cluster.center = { lat: avgLat, lng: avgLng };

        const distances = cluster.pois.map((poi) =>
          this.geographicDistance(poi.coordinates, cluster.center)
        );
        cluster.stats = {
          size: cluster.pois.length,
          avgDistanceToCenter:
            distances.reduce((a, b) => a + b, 0) / distances.length || 0,
          maxDistanceToCenter: Math.max(...distances, 0),
        };
      });
    }

    return cleaned.filter((c) => c.pois.length > 0);
  }

  /**
   * Optimize route using nearest-neighbor (avoid zig-zag)
   * @private
   */
  optimizeRoute(pois) {
    if (pois.length <= 1) return pois;

    const route = [pois[0]];
    const remaining = [...pois.slice(1)];

    while (remaining.length > 0) {
      const current = route[route.length - 1];
      let nearestIdx = 0;
      let minDist = Infinity;

      remaining.forEach((poi, idx) => {
        const dist = this.geographicDistance(
          current.coordinates,
          poi.coordinates
        );
        if (dist < minDist) {
          minDist = dist;
          nearestIdx = idx;
        }
      });

      route.push(remaining[nearestIdx]);
      remaining.splice(nearestIdx, 1);
    }

    return route;
  }

  /**
   * Initialize K-means centroids using K-means++ algorithm
   * (Ensures centroids are well-distributed geographically)
   * MEJORADO: Usa probabilidades ponderadas por distancia al cuadrado
   * @private
   */
  initializeCentroidsKMeansPlusPlus(pois, k) {
    if (pois.length === 0) return [];

    const centroids = [];

    // 1. Choose first centroid randomly from POIs
    const firstIdx = Math.floor(Math.random() * pois.length);
    centroids.push({ ...pois[firstIdx].coordinates });

    // 2. For each subsequent centroid, choose POI with probability proportional to D(x)^2
    // donde D(x) = distancia al centroide más cercano
    for (let i = 1; i < k; i++) {
      const distances = pois.map((poi) => {
        // Find minimum distance to existing centroids
        const minDist = Math.min(
          ...centroids.map((centroid) =>
            this.geographicDistance(poi.coordinates, centroid)
          )
        );
        return minDist;
      });

      // Calcular distancias al cuadrado (D(x)^2)
      const squaredDistances = distances.map((d) => d * d);
      const totalSquaredDist = squaredDistances.reduce((a, b) => a + b, 0);

      // Selección aleatoria ponderada
      let random = Math.random() * totalSquaredDist;
      let selectedIdx = 0;

      for (let j = 0; j < squaredDistances.length; j++) {
        random -= squaredDistances[j];
        if (random <= 0) {
          selectedIdx = j;
          break;
        }
      }

      centroids.push({ ...pois[selectedIdx].coordinates });
    }

    return centroids;
  }

  /**
   * Calculate average separation between centroids
   * @private
   */
  calculateAvgSeparation(centroids) {
    if (centroids.length <= 1) return 0;

    let totalDist = 0;
    let count = 0;

    for (let i = 0; i < centroids.length; i++) {
      for (let j = i + 1; j < centroids.length; j++) {
        totalDist += this.geographicDistance(centroids[i], centroids[j]);
        count++;
      }
    }

    return count > 0 ? totalDist / count : 0;
  }

  /**
   * Calculate geographic distance using Haversine formula
   * @private
   */
  geographicDistance(coord1, coord2) {
    const R = 6371; // Earth radius in km
    const dLat = ((coord2.lat - coord1.lat) * Math.PI) / 180;
    const dLng = ((coord2.lng - coord1.lng) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((coord1.lat * Math.PI) / 180) *
        Math.cos((coord2.lat * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }
}

export default new SmartPOIService();

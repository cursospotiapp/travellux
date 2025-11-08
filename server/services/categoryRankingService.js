/**
 * Category-Based Ranking Service
 *
 * Sistema de rankings por categorías con pesos configurables
 * Garantiza variedad en los POIs seleccionados
 */

/**
 * Configuración de categorías y sus pesos
 */
const CATEGORY_CONFIG = {
  monuments: {
    weight: 0.6, // 60% de los POIs
    name: 'Monumentos y Atracciones Principales',
    types: [
      'basilica',
      'cathedral',
      'church',
      'chapel',
      'monastery',
      'attraction',
      'monument',
      'memorial',
      'castle',
      'palace',
      'historic',
      'tower',
      'bridge',
      'ruins',
      'archaeological_site',
      'city_gate',
      'fountain',
      'artwork',
      'viewpoint',
    ],
    tags: {
      tourism: ['attraction', 'monument', 'artwork', 'viewpoint'],
      historic: [
        'monument',
        'castle',
        'memorial',
        'ruins',
        'city_gate',
        'archaeological_site',
      ],
      building: [
        'basilica',
        'cathedral',
        'palace',
        'church',
        'chapel',
        'monastery',
      ],
      man_made: ['tower', 'bridge'],
      amenity: ['fountain'],
    },
    // Sin subcategorías, toma los top por score
  },
  culture: {
    weight: 0.25, // 25% de los POIs
    name: 'Cultura, Mercados y Gastronomía',
    types: ['museum', 'gallery', 'market', 'theatre', 'neighbourhood'],
    tags: {
      tourism: ['museum', 'gallery'],
      amenity: ['marketplace', 'theatre'],
      place: ['neighbourhood'],
    },
    // 🔥 SUBCATEGORÍAS CON PESOS para garantizar variedad
    subcategories: {
      museums: {
        weight: 0.5, // 50% de cultura = museos
        types: ['museum'],
        tags: { tourism: ['museum'] },
      },
      markets: {
        weight: 0.35, // 35% de cultura = mercados (¡IMPORTANTE!)
        types: ['market'],
        tags: { amenity: ['marketplace'] },
      },
      galleries_theatres: {
        weight: 0.15, // 15% de cultura = galerías y teatros
        types: ['gallery', 'theatre', 'neighbourhood'],
        tags: { tourism: ['gallery'], amenity: ['theatre'] },
      },
    },
  },
  streets: {
    weight: 0.15, // 15% de los POIs
    name: 'Calles, Parques y Barrios',
    types: [
      'street',
      'park',
      'garden',
      'square',
      'neighbourhood',
      'quarter',
      'pedestrian',
    ],
    tags: {
      highway: ['pedestrian'],
      leisure: ['park', 'garden'],
      place: ['square', 'neighbourhood', 'quarter'],
    },
    // Sin subcategorías
  },
};

class CategoryRankingService {
  /**
   * Clasifica POIs en categorías
   * @param {Array} pois - Array de POIs
   * @returns {Object} POIs organizados por categoría
   */
  categorizePOIs(pois) {
    console.log(`[CATEGORY] Categorizing ${pois.length} POIs...`);

    const categorized = {
      monuments: [],
      culture: [],
      streets: [],
    };

    for (const poi of pois) {
      const category = this.determinePOICategory(poi);
      if (categorized[category]) {
        categorized[category].push(poi);
      }
    }

    console.log('[CATEGORY] Distribution:');
    Object.entries(categorized).forEach(([cat, items]) => {
      console.log(`  - ${CATEGORY_CONFIG[cat].name}: ${items.length} POIs`);
    });

    return categorized;
  }

  /**
   * Determina la categoría principal de un POI
   * @private
   */
  determinePOICategory(poi) {
    const tags = poi.rawTags || {};

    // Prioridad: monuments > culture > streets

    // 1. Monumentos y atracciones (incluye iglesias, memoriales, fuentes, obras de arte)
    if (
      CATEGORY_CONFIG.monuments.types.includes(poi.type) ||
      tags.tourism === 'attraction' ||
      tags.tourism === 'artwork' ||
      tags.tourism === 'viewpoint' ||
      tags.historic === 'monument' ||
      tags.historic === 'memorial' ||
      tags.historic === 'ruins' ||
      tags.historic === 'city_gate' ||
      tags.historic === 'archaeological_site' ||
      tags.building === 'basilica' ||
      tags.building === 'cathedral' ||
      tags.building === 'church' ||
      tags.building === 'chapel' ||
      tags.building === 'monastery' ||
      tags.building === 'palace' ||
      tags.man_made === 'tower' ||
      tags.man_made === 'bridge' ||
      tags.amenity === 'fountain'
    ) {
      return 'monuments';
    }

    // 2. Cultura y mercados
    if (
      CATEGORY_CONFIG.culture.types.includes(poi.type) ||
      tags.tourism === 'museum' ||
      tags.tourism === 'gallery' ||
      tags.amenity === 'marketplace' ||
      tags.amenity === 'theatre'
    ) {
      return 'culture';
    }

    // 3. Calles, parques y barrios
    if (
      CATEGORY_CONFIG.streets.types.includes(poi.type) ||
      tags.highway === 'pedestrian' ||
      tags.leisure === 'park' ||
      tags.leisure === 'garden' ||
      tags.place === 'square' ||
      tags.place === 'neighbourhood' ||
      tags.place === 'quarter'
    ) {
      return 'streets';
    }

    // Default: monumentos
    return 'monuments';
  }

  /**
   * Selecciona TOP POIs por categoría con pesos configurados
   * Soporta subcategorías para garantizar variedad
   * @param {Object} categorizedPOIs - POIs organizados por categoría
   * @param {number} totalNeeded - Total de POIs necesarios
   * @returns {Array} POIs seleccionados
   */
  selectTopPOIsByCategory(categorizedPOIs, totalNeeded) {
    console.log(
      `[CATEGORY] Selecting ${totalNeeded} POIs with weighted distribution...`
    );

    const selected = [];

    // Calcular cantidad por categoría según pesos
    const distribution = {};
    Object.entries(CATEGORY_CONFIG).forEach(([category, config]) => {
      distribution[category] = Math.round(totalNeeded * config.weight);
    });

    // Ajustar para que sume exactamente totalNeeded
    const total = Object.values(distribution).reduce((a, b) => a + b, 0);
    if (total !== totalNeeded) {
      distribution.monuments += totalNeeded - total;
    }

    console.log('[CATEGORY] Target distribution:');
    Object.entries(distribution).forEach(([cat, count]) => {
      console.log(
        `  - ${CATEGORY_CONFIG[cat].name}: ${count} POIs (${(
          (count / totalNeeded) *
          100
        ).toFixed(0)}%)`
      );
    });

    // Seleccionar POIs de cada categoría
    Object.entries(distribution).forEach(([category, count]) => {
      const categoryPOIs = categorizedPOIs[category] || [];
      const config = CATEGORY_CONFIG[category];

      // 🔥 Si la categoría tiene subcategorías, distribuir con pesos
      if (config.subcategories) {
        console.log(`[CATEGORY]   ${config.name} - Using subcategories:`);

        const subcatDistribution = {};
        Object.entries(config.subcategories).forEach(([subcat, subconfig]) => {
          subcatDistribution[subcat] = Math.round(count * subconfig.weight);
        });

        // Ajustar para que sume exactamente count
        const subcatTotal = Object.values(subcatDistribution).reduce(
          (a, b) => a + b,
          0
        );
        if (subcatTotal !== count) {
          const firstSubcat = Object.keys(subcatDistribution)[0];
          subcatDistribution[firstSubcat] += count - subcatTotal;
        }

        // Seleccionar de cada subcategoría
        Object.entries(subcatDistribution).forEach(([subcat, subcatCount]) => {
          const subconfig = config.subcategories[subcat];

          // Filtrar POIs de esta subcategoría
          const subcatPOIs = categoryPOIs.filter((poi) =>
            this.matchesSubcategory(poi, subconfig)
          );

          // Ordenar por score y tomar top N
          const sorted = [...subcatPOIs].sort(
            (a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0)
          );
          const topN = sorted.slice(0, subcatCount);
          selected.push(...topN);

          console.log(
            `[CATEGORY]     - ${subcat}: ${topN.length}/${subcatCount} selected (${subcatPOIs.length} available)`
          );
          if (topN.length > 0) {
            console.log(
              `[CATEGORY]       Top: ${topN
                .slice(0, 3)
                .map((p) => p.name)
                .join(', ')}`
            );
          }
        });
      } else {
        // Sin subcategorías, seleccionar top N por score
        const sorted = [...categoryPOIs].sort(
          (a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0)
        );

        const topN = sorted.slice(0, count);
        selected.push(...topN);

        console.log(
          `[CATEGORY]   ${config.name}: selected ${topN.length}/${count} (available: ${categoryPOIs.length})`
        );

        if (topN.length > 0) {
          console.log(
            `[CATEGORY]     Top 3: ${topN
              .slice(0, 3)
              .map((p) => p.name)
              .join(', ')}`
          );
        }
      }
    });

    const shortage = totalNeeded - selected.length;

    console.log(
      `[CATEGORY] ✓ Initial selection: ${selected.length}/${totalNeeded} POIs`
    );

    // 🔥 SISTEMA DE RELLENO INTELIGENTE (para viajes largos: 10 días × 6 = 60 POIs)
    if (shortage > 0) {
      console.log(
        `[CATEGORY] ⚠️  Shortage of ${shortage} POIs detected. Using intelligent fill...`
      );

      // FASE 1: Redistribuir desde categorías con exceso (POIs de alta calidad)
      const availableByCategory = {};
      Object.entries(categorizedPOIs).forEach(([category, categoryPOIs]) => {
        const selectedIds = new Set(selected.map((p) => p.id || p.name));
        const remaining = categoryPOIs.filter(
          (p) => !selectedIds.has(p.id || p.name)
        );
        if (remaining.length > 0) {
          availableByCategory[category] = remaining.sort(
            (a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0)
          );
        }
      });

      let added = 0;

      // PASO 1: Añadir POIs de alta calidad de otras categorías
      const categoriesWithPOIs = Object.entries(availableByCategory).sort(
        (a, b) => b[1].length - a[1].length
      ); // Ordenar por cantidad disponible

      for (const [category, availablePOIs] of categoriesWithPOIs) {
        // Solo añadir POIs con score >= 50 (calidad media-alta)
        const highQualityPOIs = availablePOIs.filter(
          (p) => (p.relevanceScore || 0) >= 50
        );
        const toAdd = Math.min(shortage - added, highQualityPOIs.length);

        if (toAdd > 0) {
          const additionalPOIs = highQualityPOIs.slice(0, toAdd);
          selected.push(...additionalPOIs);
          added += toAdd;

          console.log(
            `[CATEGORY]   + Added ${toAdd} quality POIs (score≥50) from ${CATEGORY_CONFIG[category].name}`
          );
          console.log(
            `[CATEGORY]     ${additionalPOIs
              .map((p) => `${p.name} (${p.relevanceScore})`)
              .join(', ')}`
          );

          if (added >= shortage) break;
        }
      }

      // PASO 2: Si aún faltan, añadir POIs de menor calidad (para días finales)
      if (added < shortage) {
        console.log(
          `[CATEGORY]   Still missing ${
            shortage - added
          } POIs. Adding secondary POIs...`
        );

        for (const [category, availablePOIs] of categoriesWithPOIs) {
          const selectedIds = new Set(selected.map((p) => p.id || p.name));
          const remaining = availablePOIs.filter(
            (p) => !selectedIds.has(p.id || p.name)
          );
          const toAdd = Math.min(shortage - added, remaining.length);

          if (toAdd > 0) {
            const additionalPOIs = remaining.slice(0, toAdd);
            selected.push(...additionalPOIs);
            added += toAdd;

            console.log(
              `[CATEGORY]   + Added ${toAdd} secondary POIs from ${CATEGORY_CONFIG[category].name}`
            );

            if (added >= shortage) break;
          }
        }
      }

      console.log(
        `[CATEGORY] ✓ Intelligent fill complete: ${selected.length}/${totalNeeded} POIs`
      );

      if (selected.length < totalNeeded) {
        console.log(
          `[CATEGORY] ⚠️  WARNING: Still ${
            totalNeeded - selected.length
          } POIs short. Need more POIs from source.`
        );
      }
      console.log();
    } else {
      console.log();
    }

    // 🔥 ORDENAR FINAL: POIs más importantes primero (para días iniciales)
    // Los POIs con mayor score irán a los primeros días del viaje
    selected.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));

    console.log(
      `[CATEGORY] ✓ Final ranking: ${selected.length} POIs sorted by importance`
    );
    if (selected.length > 0) {
      const topScores = selected
        .slice(0, 5)
        .map((p) => `${p.name} (${p.relevanceScore})`);
      const bottomScores = selected
        .slice(-3)
        .map((p) => `${p.name} (${p.relevanceScore})`);
      console.log(`[CATEGORY]   Top 5: ${topScores.join(', ')}`);
      console.log(`[CATEGORY]   Bottom 3: ${bottomScores.join(', ')}`);
    }
    console.log();

    return selected;
  }

  /**
   * Verifica si un POI coincide con una subcategoría
   * @private
   */
  matchesSubcategory(poi, subconfig) {
    const tags = poi.rawTags || {};

    // Verificar por tipo
    if (subconfig.types && subconfig.types.includes(poi.type)) {
      return true;
    }

    // Verificar por tags
    if (subconfig.tags) {
      for (const [tagKey, tagValues] of Object.entries(subconfig.tags)) {
        if (Array.isArray(tagValues)) {
          if (tagValues.includes(tags[tagKey])) {
            return true;
          }
        } else if (tagValues === true && tags[tagKey]) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Genera ranking detallado por categoría para debugging
   * @param {Object} categorizedPOIs - POIs organizados por categoría
   * @returns {Object} Rankings con top 10 de cada categoría
   */
  generateCategoryRankings(categorizedPOIs) {
    const rankings = {};

    Object.entries(categorizedPOIs).forEach(([category, pois]) => {
      const sorted = [...pois].sort(
        (a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0)
      );

      rankings[category] = {
        name: CATEGORY_CONFIG[category].name,
        total: pois.length,
        top10: sorted.slice(0, 10).map((poi, idx) => ({
          rank: idx + 1,
          name: poi.name,
          type: poi.type,
          score: poi.relevanceScore,
          wikipedia: poi.wikipedia || null,
        })),
      };
    });

    return rankings;
  }

  /**
   * Imprime rankings por categoría (para debugging)
   */
  printCategoryRankings(rankings) {
    console.log('\n' + '='.repeat(80));
    console.log('📊 RANKINGS POR CATEGORÍA');
    console.log('='.repeat(80));

    Object.entries(rankings).forEach(([category, data]) => {
      console.log(`\n🏆 ${data.name.toUpperCase()} (${data.total} total)`);
      console.log('-'.repeat(80));

      data.top10.forEach((item) => {
        console.log(
          `${item.rank}. ${item.name} (${item.type}) - Score: ${item.score}`
        );
      });
    });

    console.log('\n' + '='.repeat(80) + '\n');
  }
}

export default new CategoryRankingService();

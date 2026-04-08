# Chapter 53 – Population Ecology
*Campbell Biology AP Edition 12e | Unit 8*

---

## Learning Objectives (AP College Board)

- Describe a population using density, dispersion, and demographics
- Explain the differences between exponential and logistic models of population growth
- Explain how density-dependent and density-independent factors control population growth
- Describe how a change in matter or energy will affect the population or community
- Describe the effect of age distributions and fecundity on human populations as presented in age-structure pyramids

---

## 53.1 – Biotic and Abiotic Factors Affect Population Density, Dispersion, and Demographics

### Key Definitions

| Term | Definition |
|------|-----------|
| **Population** | A group of individuals of a single species living in the same general area |
| **Density** | Number of individuals per unit area or volume |
| **Dispersion** | Pattern of spacing among individuals within a population |
| **Mark-Recapture Method** | Technique to estimate population size: capture, mark, release, recapture; N = (s × n) / x |
| **Immigration** | Influx of new individuals from other areas (increases population) |
| **Emigration** | Movement of individuals out of a population (decreases population) |
| **Territoriality** | Defense of a bounded physical space; drives uniform dispersion |
| **Demography** | Study of birth, death, and migration rates in a population |
| **Life Table** | Summary of survival and reproductive rates by age-group |
| **Cohort** | Group of individuals of the same age followed from birth to death |
| **Survivorship Curve** | Graph of proportion of a cohort still alive at each age |

### Patterns of Dispersion

- **Clumped** – most common; individuals aggregate in patches (resources, mating, defense)
- **Uniform** – even spacing; caused by competition or territoriality
- **Random** – unpredictable spacing; no strong attraction/repulsion (e.g., dandelions)

### Figure 53.5 – Three Types of Survivorship Curves

```
Number surviving (log scale)
1000 |
     |\
     | \        ← Type I (humans, elephants)
     |   \           Low early mortality, steep drop in old age
     |    \___
     |        \   ← Type II (squirrels, lizards)
     |         \      Constant mortality rate throughout life
     |          \
     |  \        \
     |   \________\ ← Type III (oysters, many fish)
   0 +----+--------+--→
     0               100%
         % of max life span
```

- **Type I** – low early mortality, high late mortality → large mammals (humans, elephants)
- **Type II** – constant mortality throughout life → squirrels, lizards, annual plants
- **Type III** – very high early mortality, low late mortality → oysters, fish, marine invertebrates

---

## 53.2 – Exponential Population Growth

### Definition

**Exponential growth** – population increases by a constant *per capita* rate; resources assumed unlimited; produces a **J-shaped curve**

### AP Formula

$$\frac{dN}{dt} = rN$$

| Variable | Meaning |
|----------|---------|
| dN/dt | Rate of population growth (individuals added per unit time) |
| N | Current population size |
| **r** | **Intrinsic rate of increase** – per capita rate of growth; constant in exponential model; higher r = faster growth |

### Graph: J-Shaped Curve

```
Population
size (N)
  |          /
  |        /
  |       /
  |     /
  |   /
  |  /
  | /
  |/
  +----------→ Time (generations)
```

- Curve gets steeper over time because more individuals are reproducing
- Occurs when resources are unlimited (or after a population crash/new colonization)
- *Example: elephants in Kruger National Park grew exponentially for ~60 years after being protected from hunting*

---

## 53.3 – Logistic Population Growth

### Definition

**Carrying capacity (K)** – the maximum population size a particular environment can sustain, set by limiting resources (food, shelter, nesting sites, water)

**Logistic growth** – growth rate slows as N approaches K; produces an **S-shaped (sigmoid) curve**

### AP Formula

$$\frac{dN}{dt} = rN\left(\frac{K - N}{K}\right)$$

| Variable | Meaning |
|----------|---------|
| K | Carrying capacity |
| (K − N)/K | Fraction of carrying capacity still available; approaches 0 as N → K |
| r | Intrinsic rate of increase |

> When N is small → (K−N)/K ≈ 1 → growth ≈ exponential  
> When N = K/2 → growth rate is *maximum*  
> When N = K → growth rate = 0

### Graph: S-Shaped Curve

```
Population
size (N)
K  |------------ ___________  ← Carrying capacity
   |          /
   |         /   ← Growth rate highest here (N = K/2)
   |        /
   |       /
   |      /
   |    _/
   |___/
   +----------→ Time (generations)
```

- Growth rate *decreases* as N approaches K (birth rate falls or death rate rises)
- Populations can temporarily **overshoot** K if there's a lag in negative feedback

---

## 53.4 – Life History Traits Are Products of Natural Selection

> The guide says: *Define semelparity, iteroparity, K-selection, and r-selection. That is all you need!*

| Term | Definition | Example |
|------|-----------|---------|
| **Semelparity** | Single reproductive event in a lifetime ("big-bang" reproduction), then death | Salmon, agave |
| **Iteroparity** | Repeated reproductive events throughout lifetime | Loggerhead turtle, oak tree, most large mammals |
| **K-selection** | Selection favoring traits advantageous at *high density* (near K); fewer offspring, more parental care, long life | Mature trees in old-growth forest, elephants |
| **r-selection** | Selection favoring traits that maximize r (reproductive rate) in *uncrowded* environments; many offspring, little care | Weeds in disturbed fields, mice |

**Trade-off:** Organisms cannot maximize both offspring number *and* parental investment — resources devoted to reproduction reduce resources available for survival, and vice versa.

---

## 53.5 – Density-Dependent Factors Regulate Population Growth

### Definitions

| Term | Definition | Example |
|------|-----------|---------|
| **Density-independent** | Birth/death rate does NOT change with population density; usually abiotic | Drought, frost, fire, floods |
| **Density-dependent** | Birth rate decreases OR death rate increases as density rises; provides negative feedback | Competition, disease, predation, territoriality |

### Density-Dependent Mechanisms (Figure 53.17)

1. **Competition for resources** – more individuals → less food/nutrients per individual → lower birth rate
2. **Disease** – crowding increases transmission rate (e.g., flu, tuberculosis)
3. **Predation** – predators capture more prey as prey density rises; "switching" behavior
4. **Territoriality** – limited space → fewer breeding territories → some individuals excluded from reproduction
5. **Intrinsic factors** – high density triggers stress hormones, delaying maturation and depressing immunity (e.g., white-footed mice)
6. **Toxic wastes** – metabolic byproducts accumulate and poison individuals (e.g., ethanol in yeast)

### The Boom-Bust Cycle (Figure 53.18 / 53.19)

**Pattern:** Population grows rapidly → overshoots resources or is overexploited by predators → crashes → recovers → repeats

**Figure 53.18 – Moose and Wolves on Isle Royale:**
- Moose population cycles dramatically; crashes coincide with high wolf populations (predation) and harsh winters (density-independent stress)
- Shows interaction of density-dependent (predation) AND density-independent (weather) factors

**Figure 53.19 – Snowshoe Hare and Lynx (~10-year cycle):**

```
Number
  |  Hares ___              ___
  |       /   \   ___      /
  |      /     \_/   \    /
  |     /              \__/
  |  Lynx    _              _
  |         / \   _        / \
  |        /   \_/ \      /
  |   ____/         \____/
  +--+--+--+--+--+--+--+--→ Time (years)
```

- Lynx peaks *follow* hare peaks (predator lags behind prey)
- Hare cycles driven primarily by **predator overexploitation**, not food shortage alone (fencing out predators eliminated the crash)

### Metapopulation (bonus vocab from 53.5)

- **Metapopulation** – a network of local populations linked by immigration/emigration in a patchy habitat
- Local populations can go extinct; patches can be recolonized from neighboring populations
- *Example: Glanville fritillary butterfly on Åland Islands, Finland*

---

## Key Vocabulary Summary

| Term | One-Line Definition |
|------|-------------------|
| Population | All individuals of one species in an area |
| Density | Individuals per unit area/volume |
| Dispersion | Spatial pattern of individuals (clumped/uniform/random) |
| Mark-Recapture | Method to estimate N: N = (s × n) / x |
| Immigration | Individuals entering a population |
| Emigration | Individuals leaving a population |
| Territoriality | Defense of space → uniform dispersion |
| Demography | Study of population vital rates |
| Life table | Age-specific survival and reproduction data |
| Cohort | Same-age group tracked over time |
| Survivorship curve | Graph of % of cohort alive at each age (Types I, II, III) |
| Exponential growth | J-curve; dN/dt = rN; constant per capita growth |
| Intrinsic rate of increase (r) | Per capita growth rate in ideal conditions |
| Carrying capacity (K) | Max sustainable population size |
| Logistic growth | S-curve; dN/dt = rN[(K−N)/K]; growth slows near K |
| Semelparity | Reproduce once, then die |
| Iteroparity | Reproduce repeatedly throughout life |
| K-selected | Few offspring, high investment, adapted to crowded conditions |
| r-selected | Many offspring, low investment, adapted to uncrowded conditions |
| Density-dependent | Factor whose effect intensifies as density increases |
| Density-independent | Factor with same effect regardless of density |

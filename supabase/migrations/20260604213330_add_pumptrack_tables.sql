-- ─────────────────────────────────────────────────────────
-- Tabela de pump tracks
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trilhas_pumptrack (
  id                   text PRIMARY KEY,
  nome                 text NOT NULL,
  cidade               text,
  uf                   text,
  endereco             text,
  latitude             numeric(10,6),
  longitude            numeric(10,6),
  tipo_superficie      text,
  comprimento_estimado text,
  iluminacao           text,
  estacionamento       text,
  fonte                text,
  google_maps_url      text,
  instagram            text,
  status_validacao     text,
  created_at           timestamptz DEFAULT now()
);

ALTER TABLE trilhas_pumptrack ENABLE ROW LEVEL SECURITY;
CREATE POLICY "pumptrack_read_all" ON trilhas_pumptrack FOR SELECT USING (true);

-- ─────────────────────────────────────────────────────────
-- Dados do CSV (15 pump tracks)
-- ─────────────────────────────────────────────────────────
INSERT INTO trilhas_pumptrack (id, nome, cidade, uf, endereco, latitude, longitude, tipo_superficie, comprimento_estimado, iluminacao, estacionamento, fonte, google_maps_url, instagram, status_validacao) VALUES
('BR-001','Pump Track Moema','São Paulo','SP','Parque das Bicicletas, Al. Iraé, 35',-23.5992,-46.6575,'Asfalto','220m','Não','Sim (Parque)','Velosolutions','https://maps.google.com/?q=-23.5992,-46.6575','@velosolutionsbr','Ativo - Homologado'),
('BR-002','Pump Track DRAC','São Paulo','SP','Centro de Esportes Radicais, Bom Retiro',-23.5186,-46.6414,'Asfalto','350m (03 pistas)','Sim','Sim (Parque)','Governo SP','https://maps.google.com/?q=-23.5186,-46.6414','@esportesradicaissp','Ativo - Homologado'),
('BR-003','Mooca Trails / Pump Park','São Paulo','SP','Centro Esportivo da Mooca, Rua Taquari, 635',-23.5489,-46.5982,'Terra / Saibro','180m','Sim','Na Rua','Mapeamento Local','https://maps.google.com/?q=-23.5489,-46.5982','@moocatrails','Ativo - Base de Dados'),
('BR-004','Pump Track Sacomã','São Paulo','SP','Parque Linear do Sacomã',-23.6061,-46.5912,'Asfalto','150m','Sim','Na Rua','Blue Pump Tracks','https://maps.google.com/?q=-23.6061,-46.5912',NULL,'Ativo - Base de Dados'),
('BR-005','Lago do Taboão','Bragança Paulista','SP','Av. Alpheu Grimello, Taboão',-22.9698,-46.5412,'Asfalto','200m','Sim','Na Rua','Velosolutions','https://maps.google.com/?q=-22.9698,-46.5412','@prefeituradebraganca','Ativo - Homologado'),
('BR-006','Mobai Bike Land','São José dos Campos','SP','Av. Dr. Jamil João Zarif, Urbanova',-23.1554,-45.8457,'Asfalto / Terra','260m','Não','Sim (Privado)','Mobai','https://maps.google.com/?q=-23.1554,-45.8457','@mobaibikeland','Ativo - Homologado'),
('BR-007','Zoom Bike Park','Campos do Jordão','SP','Av. Pedro Paulo, TSA',-22.7011,-45.5022,'Terra / Madeira','120m','Não','Sim (Parque)','Zoom BP','https://maps.google.com/?q=-22.7011,-45.5022','@zoombikepark','Ativo - Base de Dados'),
('BR-008','Pump Track Aguaí','Aguaí','SP','Parque Interlagos, Centro',-22.0624,-46.9741,'Asfalto','190m','Sim','Sim','Blue Pump Tracks','https://maps.google.com/?q=-22.0624,-46.9741','@prefeituradeaguai','Ativo - Base de Dados'),
('BR-009','Henrique Avancini','Petrópolis','RJ','Estr. União e Indústria, 10.000, Itaipava',-22.3912,-43.1314,'Asfalto','210m','Sim','Sim (Complexo)','Velosolutions','https://maps.google.com/?q=-22.3912,-43.1314','@pistahenriqueavancini','Ativo - Homologado'),
('BR-010','Donana Bike Park','Petrópolis','RJ','Pouso Donana Camping, Itaipava',-22.3855,-43.1210,'Terra','140m','Não','Sim (Camping)','MTB Brasil','https://maps.google.com/?q=-22.3855,-43.1210','@pousodonana','Ativo - Base de Dados'),
('BR-011','Pump Track Mariana','Mariana','MG','Arena Poliesportiva de Mariana',-20.3754,-43.4142,'Asfalto','240m','Sim','Sim','Velosolutions','https://maps.google.com/?q=-20.3754,-43.4142','@prefeiturademariana','Ativo - Homologado'),
('BR-012','Pump Track Itabira','Itabira','MG','Esplanada da Estação',-19.6198,-43.2214,'Asfalto','210m','Sim','Sim','Blue Pump Tracks','https://maps.google.com/?q=-19.6198,-43.2214','@prefeituradeitabira','Ativo - Base de Dados'),
('BR-013','Ponta da Fruta','Vila Velha','ES','Av. Sílvio Baratella, 160',-20.4891,-40.3814,'Concreto / Asf.','160m','Sim','Na Rua','Mapeamento Local','https://maps.google.com/?q=-20.4891,-40.3814',NULL,'Ativo - Base de Dados'),
('BR-014','Sesc Urubici','Urubici','SC','Avenida Adolfo Konder, s/nº',-28.0124,-49.5911,'Asfalto','180m','Não','Sim (Hotel)','Sesc SC','https://maps.google.com/?q=-28.0124,-49.5911','@sesc_sc','Ativo - Homologado'),
('BR-015','Terra na Veia','Maracanaú','CE','Complexo de MTB, Zona Rural',-3.8745,-38.6212,'Terra','150m','Não','Sim','Nordeste MTB','https://maps.google.com/?q=-3.8745,-38.6212','@terranaveia','Ativo - Base de Dados')
ON CONFLICT (id) DO NOTHING;

-- ─────────────────────────────────────────────────────────
-- Condições de previsão (forecast-only, sem cálculo de solo)
-- ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS condicoes_pumptrack (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  pumptrack_id text NOT NULL REFERENCES trilhas_pumptrack(id) ON DELETE CASCADE,
  gerado_em    timestamptz NOT NULL DEFAULT now(),
  rain_mm      numeric(6,1),
  pico_3h      numeric(6,1),
  wind_kmh     numeric(6,1),
  temp_max     numeric(5,1),
  temp_min     numeric(5,1),
  pop_48h      integer
);

CREATE UNIQUE INDEX IF NOT EXISTS condicoes_pumptrack_unique ON condicoes_pumptrack(pumptrack_id);

ALTER TABLE condicoes_pumptrack ENABLE ROW LEVEL SECURITY;
CREATE POLICY "condicoes_pumptrack_read_all" ON condicoes_pumptrack FOR SELECT USING (true);

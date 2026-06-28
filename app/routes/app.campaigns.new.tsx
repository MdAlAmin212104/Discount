export default function AdditionalPage() {
  return (
    <s-page heading="Additional page">
      <form data-save-bar>
      <s-section heading="Campaign Information">
        <s-card>
          <s-stack direction="block" gap="base">
            <s-text-field
              label="Campaign Name"
              placeholder="Enter campaign name"
            />
          </s-stack>
        </s-card>

        <s-box paddingBlock="base">
          <s-choice-list label="Discount Type" name="discount">
            <s-choice value="percentage" selected>
              Percentage (%)
            </s-choice>
            <s-choice value="fixed">
              Fixed Amount ($)
            </s-choice>
          </s-choice-list>
        </s-box>
      </s-section>

      <s-section heading="Product Selection" padding="base">
        <s-box>
          <s-choice-list label="Select product option" name="product">
            <s-choice value="products" selected>
              Products
            </s-choice>
            <s-choice value="collections">
              Collections
            </s-choice>
            <s-choice value="tags">
              Tags
            </s-choice>
          </s-choice-list>
        </s-box>

        <s-table>
          <s-grid slot="filters" gap="small-200" gridTemplateColumns="1fr auto">
            <s-text-field
              label="Search puzzles"
              labelAccessibilityVisibility="exclusive"
              icon="search"
              placeholder="Searching all puzzles"
            />
            <s-button>Browse</s-button>
          </s-grid>

          <s-table-header-row>
            <s-table-header listSlot="primary">Template</s-table-header>
            <s-table-header listSlot="secondary" format="numeric">Actions</s-table-header>
          </s-table-header-row>

          <s-table-body>
            <s-table-row clickDelegate="mountain-view-checkbox">
              <s-table-cell>
                <s-stack direction="inline" gap="small" alignItems="center">
                  <s-clickable
                    href=""
                    accessibilityLabel="Mountain View puzzle thumbnail"
                    border="base"
                    borderRadius="base"
                    overflow="hidden"
                    inlineSize="40px"
                    blockSize="40px"
                  >
                    <s-image
                      objectFit="cover"
                      src="https://picsum.photos/id/29/80/80"
                    />
                  </s-clickable>
                  <s-link href="">Mountain View</s-link>
                </s-stack>
              </s-table-cell>
              <s-table-cell>
                <s-button
                  icon="delete"
                  accessibilityLabel="Delete Mountain View campaign"
                  tone="critical"
                />
              </s-table-cell>
            </s-table-row>

            <s-table-row clickDelegate="ocean-sunset-checkbox">
              <s-table-cell>
                <s-stack direction="inline" gap="small" alignItems="center">
                  <s-clickable
                    href=""
                    accessibilityLabel="Ocean Sunset puzzle thumbnail"
                    border="base"
                    borderRadius="base"
                    overflow="hidden"
                    inlineSize="40px"
                    blockSize="40px"
                  >
                    <s-image
                      objectFit="cover"
                      src="https://picsum.photos/id/12/80/80"
                    />
                  </s-clickable>
                  <s-link href="">Ocean Sunset</s-link>
                </s-stack>
              </s-table-cell>
              <s-table-cell>
                <s-button
                  icon="delete"
                  accessibilityLabel="Delete Ocean Sunset campaign"
                  tone="critical"
                />
              </s-table-cell>
            </s-table-row>

            <s-table-row clickDelegate="forest-animals-checkbox">
              <s-table-cell>
                <s-stack direction="inline" gap="small" alignItems="center">
                  <s-clickable
                    href=""
                    accessibilityLabel="Forest Animals puzzle thumbnail"
                    border="base"
                    borderRadius="base"
                    overflow="hidden"
                    inlineSize="40px"
                    blockSize="40px"
                  >
                    <s-image
                      objectFit="cover"
                      src="https://picsum.photos/id/324/80/80"
                    />
                  </s-clickable>
                  <s-link href="">Forest Animals</s-link>
                </s-stack>
              </s-table-cell>
              <s-table-cell>
                <s-button
                  icon="delete"
                  accessibilityLabel="Delete Forest Animals campaign"
                  tone="critical"
                />
              </s-table-cell>
            </s-table-row>
          </s-table-body>
        </s-table>
      </s-section>


      <s-section heading="phase added informate on this section">
        <s-grid gridTemplateColumns="1fr auto" gap="small-400" alignItems="start">
          <s-grid
            gridTemplateColumns="@container (inline-size <= 480px) 1fr, auto auto"
            gap="base"
            alignItems="center"
          >
            <s-grid gap="small-200">
              <s-heading>phase opiton on this section </s-heading>
              <s-paragraph>
                your can added on mulpltel option phase on hthis options.
              </s-paragraph>

            </s-grid>
          </s-grid>

        </s-grid>
      </s-section>


      <s-section heading="phase 1">
        <s-text-field label="Phase Title (Admin & Widget)" placeholder="Inner Circle Access"></s-text-field>
        <s-text-field label="Badge Label" placeholder="Drop 1 — open now"></s-text-field>

        <s-number-field
          label="Discount percent"
          placeholder="0"
          step="1"
          min="1"
          max="100"
          suffix="%"
        />

        <s-stack gap="base">
          <s-heading>Sales report period</s-heading>

          <s-grid gridTemplateColumns="repeat(12, 1fr)" gap="base" alignItems="center">
            <s-grid-item gridColumn="span 6" gridRow="span 1" >
              <s-date-field

                label="Start date"
                name="startDate"
                id="report-start"
              ></s-date-field>
            </s-grid-item>

            <s-grid-item gridColumn="span 6" gridRow="span 1">
              <s-text>Time</s-text>
              <s-select icon="watch">
                <s-option value="00:00" selected>12:00 AM</s-option>
                <s-option value="00:30">12:30 AM</s-option>
                <s-option value="01:00">01:00 AM</s-option>
                <s-option value="01:30">01:30 AM</s-option>
                <s-option value="02:00">02:00 AM</s-option>
                <s-option value="02:30">02:30 AM</s-option>
                <s-option value="03:00">03:00 AM</s-option>
                <s-option value="03:30">03:30 AM</s-option>
                <s-option value="04:00">04:00 AM</s-option>
                <s-option value="04:30">04:30 AM</s-option>
                <s-option value="05:00">05:00 AM</s-option>
                <s-option value="05:30">05:30 AM</s-option>
                <s-option value="06:00">06:00 AM</s-option>
                <s-option value="06:30">06:30 AM</s-option>
                <s-option value="07:00">07:00 AM</s-option>
                <s-option value="07:30">07:30 AM</s-option>
                <s-option value="08:00">08:00 AM</s-option>
                <s-option value="08:30">08:30 AM</s-option>
                <s-option value="09:00">09:00 AM</s-option>
                <s-option value="09:30">09:30 AM</s-option>
                <s-option value="10:00">10:00 AM</s-option>
                <s-option value="10:30">10:30 AM</s-option>
                <s-option value="11:00">11:00 AM</s-option>
                <s-option value="11:30">11:30 AM</s-option>
                <s-option value="12:00">12:00 PM</s-option>
                <s-option value="12:30">12:30 PM</s-option>
                <s-option value="13:00">01:00 PM</s-option>
                <s-option value="13:30">01:30 PM</s-option>
                <s-option value="14:00">02:00 PM</s-option>
                <s-option value="14:30">02:30 PM</s-option>
                <s-option value="15:00">03:00 PM</s-option>
                <s-option value="15:30">03:30 PM</s-option>
                <s-option value="16:00">04:00 PM</s-option>
                <s-option value="16:30">04:30 PM</s-option>
                <s-option value="17:00">05:00 PM</s-option>
                <s-option value="17:30">05:30 PM</s-option>
                <s-option value="18:00">06:00 PM</s-option>
                <s-option value="18:30">06:30 PM</s-option>
                <s-option value="19:00">07:00 PM</s-option>
                <s-option value="19:30">07:30 PM</s-option>
                <s-option value="20:00">08:00 PM</s-option>
                <s-option value="20:30">08:30 PM</s-option>
                <s-option value="21:00">09:00 PM</s-option>
                <s-option value="21:30">09:30 PM</s-option>
                <s-option value="22:00">10:00 PM</s-option>
                <s-option value="22:30">10:30 PM</s-option>
                <s-option value="23:00">11:00 PM</s-option>
                <s-option value="23:30">11:30 PM</s-option>
              </s-select>
            </s-grid-item>


          </s-grid>

          <s-grid gridTemplateColumns="repeat(12, 1fr)" gap="base" alignItems="center">
            <s-grid-item gridColumn="span 6" gridRow="span 1" >
              <s-date-field
                label="End date"
                name="startDate"
                id="report-start"
              ></s-date-field>
            </s-grid-item>

            <s-grid-item gridColumn="span 6" gridRow="span 1">
              <s-text>Time</s-text>
              <s-select icon="watch">
                <s-option value="00:00" selected>12:00 AM</s-option>
                <s-option value="00:30">12:30 AM</s-option>
                <s-option value="01:00">01:00 AM</s-option>
                <s-option value="01:30">01:30 AM</s-option>
                <s-option value="02:00">02:00 AM</s-option>
                <s-option value="02:30">02:30 AM</s-option>
                <s-option value="03:00">03:00 AM</s-option>
                <s-option value="03:30">03:30 AM</s-option>
                <s-option value="04:00">04:00 AM</s-option>
                <s-option value="04:30">04:30 AM</s-option>
                <s-option value="05:00">05:00 AM</s-option>
                <s-option value="05:30">05:30 AM</s-option>
                <s-option value="06:00">06:00 AM</s-option>
                <s-option value="06:30">06:30 AM</s-option>
                <s-option value="07:00">07:00 AM</s-option>
                <s-option value="07:30">07:30 AM</s-option>
                <s-option value="08:00">08:00 AM</s-option>
                <s-option value="08:30">08:30 AM</s-option>
                <s-option value="09:00">09:00 AM</s-option>
                <s-option value="09:30">09:30 AM</s-option>
                <s-option value="10:00">10:00 AM</s-option>
                <s-option value="10:30">10:30 AM</s-option>
                <s-option value="11:00">11:00 AM</s-option>
                <s-option value="11:30">11:30 AM</s-option>
                <s-option value="12:00">12:00 PM</s-option>
                <s-option value="12:30">12:30 PM</s-option>
                <s-option value="13:00">01:00 PM</s-option>
                <s-option value="13:30">01:30 PM</s-option>
                <s-option value="14:00">02:00 PM</s-option>
                <s-option value="14:30">02:30 PM</s-option>
                <s-option value="15:00">03:00 PM</s-option>
                <s-option value="15:30">03:30 PM</s-option>
                <s-option value="16:00">04:00 PM</s-option>
                <s-option value="16:30">04:30 PM</s-option>
                <s-option value="17:00">05:00 PM</s-option>
                <s-option value="17:30">05:30 PM</s-option>
                <s-option value="18:00">06:00 PM</s-option>
                <s-option value="18:30">06:30 PM</s-option>
                <s-option value="19:00">07:00 PM</s-option>
                <s-option value="19:30">07:30 PM</s-option>
                <s-option value="20:00">08:00 PM</s-option>
                <s-option value="20:30">08:30 PM</s-option>
                <s-option value="21:00">09:00 PM</s-option>
                <s-option value="21:30">09:30 PM</s-option>
                <s-option value="22:00">10:00 PM</s-option>
                <s-option value="22:30">10:30 PM</s-option>
                <s-option value="23:00">11:00 PM</s-option>
                <s-option value="23:30">11:30 PM</s-option>
              </s-select>
            </s-grid-item>


          </s-grid>
        </s-stack>


        <s-grid paddingBlock="base">
          <s-checkbox
            label="Automatically apply discount code at checkout"
          />
          <s-checkbox
            label="Phase visible on storefront widget"
          />
        </s-grid>

        <s-grid paddingBlockEnd="base" gridTemplateColumns="repeat(12, 1fr)" gap="base" alignItems="center">
          <s-grid-item gridColumn="span 6" gridRow="span 1">
            <s-text-field
              label="Shipping Note Left"
              placeholder="Free Shipping"
            />
          </s-grid-item>
          <s-grid-item gridColumn="span 6" gridRow="span 1">
            <s-text-field
              label="Shipping Note Right"
              placeholder="Ships in 2 days"
            />
          </s-grid-item>
        </s-grid>
      </s-section>


      <s-section heading="phase 2">
        <s-text-field label="Phase Title (Admin & Widget)" placeholder="Inner Circle Access"></s-text-field>
        <s-text-field label="Badge Label" placeholder="Drop 1 — open now"></s-text-field>

        <s-number-field
          label="Discount percent"
          placeholder="0"
          step="1"
          min="1"
          max="100"
          suffix="%"
        />

        <s-stack gap="base">
          <s-heading>Sales report period</s-heading>

          <s-grid gridTemplateColumns="repeat(12, 1fr)" gap="base" alignItems="center">
            <s-grid-item gridColumn="span 6" gridRow="span 1" >
              <s-date-field

                label="Start date"
                name="startDate"
                id="report-start"
              ></s-date-field>
            </s-grid-item>

            <s-grid-item gridColumn="span 6" gridRow="span 1">
              <s-text>Time</s-text>
              <s-select icon="watch">
                <s-option value="00:00" selected>12:00 AM</s-option>
                <s-option value="00:30">12:30 AM</s-option>
                <s-option value="01:00">01:00 AM</s-option>
                <s-option value="01:30">01:30 AM</s-option>
                <s-option value="02:00">02:00 AM</s-option>
                <s-option value="02:30">02:30 AM</s-option>
                <s-option value="03:00">03:00 AM</s-option>
                <s-option value="03:30">03:30 AM</s-option>
                <s-option value="04:00">04:00 AM</s-option>
                <s-option value="04:30">04:30 AM</s-option>
                <s-option value="05:00">05:00 AM</s-option>
                <s-option value="05:30">05:30 AM</s-option>
                <s-option value="06:00">06:00 AM</s-option>
                <s-option value="06:30">06:30 AM</s-option>
                <s-option value="07:00">07:00 AM</s-option>
                <s-option value="07:30">07:30 AM</s-option>
                <s-option value="08:00">08:00 AM</s-option>
                <s-option value="08:30">08:30 AM</s-option>
                <s-option value="09:00">09:00 AM</s-option>
                <s-option value="09:30">09:30 AM</s-option>
                <s-option value="10:00">10:00 AM</s-option>
                <s-option value="10:30">10:30 AM</s-option>
                <s-option value="11:00">11:00 AM</s-option>
                <s-option value="11:30">11:30 AM</s-option>
                <s-option value="12:00">12:00 PM</s-option>
                <s-option value="12:30">12:30 PM</s-option>
                <s-option value="13:00">01:00 PM</s-option>
                <s-option value="13:30">01:30 PM</s-option>
                <s-option value="14:00">02:00 PM</s-option>
                <s-option value="14:30">02:30 PM</s-option>
                <s-option value="15:00">03:00 PM</s-option>
                <s-option value="15:30">03:30 PM</s-option>
                <s-option value="16:00">04:00 PM</s-option>
                <s-option value="16:30">04:30 PM</s-option>
                <s-option value="17:00">05:00 PM</s-option>
                <s-option value="17:30">05:30 PM</s-option>
                <s-option value="18:00">06:00 PM</s-option>
                <s-option value="18:30">06:30 PM</s-option>
                <s-option value="19:00">07:00 PM</s-option>
                <s-option value="19:30">07:30 PM</s-option>
                <s-option value="20:00">08:00 PM</s-option>
                <s-option value="20:30">08:30 PM</s-option>
                <s-option value="21:00">09:00 PM</s-option>
                <s-option value="21:30">09:30 PM</s-option>
                <s-option value="22:00">10:00 PM</s-option>
                <s-option value="22:30">10:30 PM</s-option>
                <s-option value="23:00">11:00 PM</s-option>
                <s-option value="23:30">11:30 PM</s-option>
              </s-select>
            </s-grid-item>


          </s-grid>

          <s-grid gridTemplateColumns="repeat(12, 1fr)" gap="base" alignItems="center">
            <s-grid-item gridColumn="span 6" gridRow="span 1" >
              <s-date-field
                label="End date"
                name="startDate"
                id="report-start"
              ></s-date-field>
            </s-grid-item>

            <s-grid-item gridColumn="span 6" gridRow="span 1">
              <s-text>Time</s-text>
              <s-select icon="watch">
                <s-option value="00:00" selected>12:00 AM</s-option>
                <s-option value="00:30">12:30 AM</s-option>
                <s-option value="01:00">01:00 AM</s-option>
                <s-option value="01:30">01:30 AM</s-option>
                <s-option value="02:00">02:00 AM</s-option>
                <s-option value="02:30">02:30 AM</s-option>
                <s-option value="03:00">03:00 AM</s-option>
                <s-option value="03:30">03:30 AM</s-option>
                <s-option value="04:00">04:00 AM</s-option>
                <s-option value="04:30">04:30 AM</s-option>
                <s-option value="05:00">05:00 AM</s-option>
                <s-option value="05:30">05:30 AM</s-option>
                <s-option value="06:00">06:00 AM</s-option>
                <s-option value="06:30">06:30 AM</s-option>
                <s-option value="07:00">07:00 AM</s-option>
                <s-option value="07:30">07:30 AM</s-option>
                <s-option value="08:00">08:00 AM</s-option>
                <s-option value="08:30">08:30 AM</s-option>
                <s-option value="09:00">09:00 AM</s-option>
                <s-option value="09:30">09:30 AM</s-option>
                <s-option value="10:00">10:00 AM</s-option>
                <s-option value="10:30">10:30 AM</s-option>
                <s-option value="11:00">11:00 AM</s-option>
                <s-option value="11:30">11:30 AM</s-option>
                <s-option value="12:00">12:00 PM</s-option>
                <s-option value="12:30">12:30 PM</s-option>
                <s-option value="13:00">01:00 PM</s-option>
                <s-option value="13:30">01:30 PM</s-option>
                <s-option value="14:00">02:00 PM</s-option>
                <s-option value="14:30">02:30 PM</s-option>
                <s-option value="15:00">03:00 PM</s-option>
                <s-option value="15:30">03:30 PM</s-option>
                <s-option value="16:00">04:00 PM</s-option>
                <s-option value="16:30">04:30 PM</s-option>
                <s-option value="17:00">05:00 PM</s-option>
                <s-option value="17:30">05:30 PM</s-option>
                <s-option value="18:00">06:00 PM</s-option>
                <s-option value="18:30">06:30 PM</s-option>
                <s-option value="19:00">07:00 PM</s-option>
                <s-option value="19:30">07:30 PM</s-option>
                <s-option value="20:00">08:00 PM</s-option>
                <s-option value="20:30">08:30 PM</s-option>
                <s-option value="21:00">09:00 PM</s-option>
                <s-option value="21:30">09:30 PM</s-option>
                <s-option value="22:00">10:00 PM</s-option>
                <s-option value="22:30">10:30 PM</s-option>
                <s-option value="23:00">11:00 PM</s-option>
                <s-option value="23:30">11:30 PM</s-option>
              </s-select>
            </s-grid-item>


          </s-grid>
        </s-stack>


        <s-grid paddingBlock="base">
          <s-checkbox
            label="Automatically apply discount code at checkout"
          />
          <s-checkbox
            label="Phase visible on storefront widget"
          />
        </s-grid>

        <s-grid paddingBlockEnd="base" gridTemplateColumns="repeat(12, 1fr)" gap="base" alignItems="center">
          <s-grid-item gridColumn="span 6" gridRow="span 1">
            <s-text-field
              label="Shipping Note Left"
              placeholder="Free Shipping"
            />
          </s-grid-item>
          <s-grid-item gridColumn="span 6" gridRow="span 1">
            <s-text-field
              label="Shipping Note Right"
              placeholder="Ships in 2 days"
            />
          </s-grid-item>
        </s-grid>
      </s-section>

      <s-section slot="aside" heading="Live Preview">
        <s-card>
          <s-stack direction="block" gap="base">
            <s-text>
              <s-heading size="small">Campaign Statistics</s-heading>
            </s-text>
            <s-unordered-list>
              <s-list-item>total phase: 2</s-list-item>
              <s-list-item>total products: 1</s-list-item>
            </s-unordered-list>

          </s-stack>
        </s-card>
      </s-section>
      </form>
    </s-page>
  );
}